/* eslint-env worker */
/* global VideoDecoder, MP4Box, EncodedVideoChunk, DataStream, CustomMP4Reader */
self.module = {}; // polyfill for module
importScripts("/js/mp4box.all.min.js");
// Load local helper scripts in dependency order so they expose globals used by CustomMP4Reader
importScripts("/js/MP4Parser.js");
importScripts("/js/SampleTableProcessor.js");
importScripts("/js/CustomMP4Reader.js");

let renderer = null; // what rendering method, could be cpu (in this case), or webGPU, webGL, etc.
let pendingFrame = null; // the frame that is currently being processed
let startTime = null;
let frameCount = 0;
let decoder = null;
let pendingStatus = null; // this is the status that will be sent to the main thread

// entry for the worker
// Startup the renderer -> and initiate the decoder
async function start(dataURI, canvas) {
    // i have chosen the 2D renderer, most prolly the CPU

    console.log("Initializing custom mp4reader");
    const mp4Reader = new CustomMP4Reader(); // creates a custom parser instance

    // range request
    // getting the first 10 MiBs
    const metaData = await fetch(dataURI, {
        method: 'HEAD',
    })

    // get the size of the file from the headers
    const fileSize = metaData.headers.get('Content-Length');
    let loadWholeFile = false; // flag to check if we need to load the whole file
    if (fileSize / 1024 / 1024 < 10) {
        loadWholeFile = true;
    }
    let response = null;
    if (loadWholeFile) {
        response = await fetch(dataURI);
    } else {
        const end = 10 * 1024 * 1024;

        response = await fetch(dataURI, {
            headers: {
                'Range': `bytes=0-${end}`
            }
        });
    }


    if (response.status !== 206) {
        console.log("Server does not support range requests");
    }

    const blob = await response.blob();
    const parsedResult = await mp4Reader.loadFile(blob);
    console.log(parsedResult);

    renderer = new Canvas2DRenderer(canvas); // this sets up the CPU to render and get the constext of the display canvas
    console.log("Renderer initialized");
    // setting up the video decoder
    decoder = new VideoDecoder({
        // output is the option which takes in a callback function that further decides what happens with the decoded frame
        output(frame) {
            //update the status
            // console.log("Decoded frame", frame);
            if (startTime == null) {
                startTime = performance.now(); //this is the time when the decoding starts
            } else {
                // this particular instance has been decoding videos for a while
                const elapsed = (performance.now() - startTime) / 1000; // get the elapsed time in seconds
                const fps = ++frameCount / elapsed; // eslint-disable-line no-unused-vars
                // update the status according to this project
            }

            // schedule the frame to be rendered
            renderFrame(frame);
        },
        error() {
            console.log("error decoding")
        }
    })

    // now define the DEMUXER 
    // demux gets the video chunks and it sends it to the decoder to decode the the frame
    // fetch and demux the media data
    console.log("Starting demuxer");
    // eslint-disable-next-line no-unused-vars
    const demuxer = new MP4Demuxer(dataURI,
        {
            onConfig(config) {
                // console.log("Configuring decoder with", config);
                decoder.configure(config);
            },
            onChunk(chunk) {
                // const decodedSample = decoder.decode(chunk);
                // console.log("Decoded sample", decodedSample);
                decoder.decode(chunk);
            },
            setStatus
        });
}

// 2D renderer
class Canvas2DRenderer {
    canvas = null;
    ctx = null;

    constructor(canvas) {
        this.canvas = canvas; // this is the reference to the canvas element
        this.ctx = canvas.getContext("2d"); // this is used to create an interface to draw on the canvas
    }

    draw(frame) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
        this.ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
        frame.close();
    }
}

// just sends the status back to the main thread, maybe used to track the progress
function statusAnimationFrame() { // eslint-disable-line no-unused-vars
    self.postMessage(pendingStatus);
    pendingStatus = null;
}

// renderer takes in the frame and draws it, this is called once per animation frame
function renderAnimationFrame() {
    renderer.draw(pendingFrame);
    pendingFrame = null;
}

// method to call the request animation frame with the previous pending frame
function renderFrame(frame) {
    if (!pendingFrame) {
        requestAnimationFrame(renderAnimationFrame);
    } else {
        // close the pending frame before replacing it to free up resources
        pendingFrame.close();
    }

    // set the new pending frame
    pendingFrame = frame;
}

// --------------------------------------------------------- DM4DEMUXER

// this is the file sink that is needed in a writable stream
class MP4FileSink {
    setStatus = null;
    file = null;
    offset = 0;

    // this will get the file object and set the status object
    constructor(file, setStatus) {
        this.file = file;
        this.setStatus = setStatus;
        this.offset = 0;
    }

    // now we create the method to write in the sink : sink is needed in an MP4Box file to write the whole video data <as per my current understanding>
    write(chunk) { // chunk is the encoded video data
        const buffer = new ArrayBuffer(chunk.byteLength); // allocate the video chunk
        new Uint8Array(buffer).set(chunk); // get a Uint8Array view over the ArrayBuffer

        // we gotta inform the MP4Box where in the file this chunk is frome, basically its id
        buffer.fileStart = this.offset; // set the file start
        this.offset += chunk.byteLength;

        // Append chunk
        // this.setStatus("fetch", (this.offset / (1024 ** 2)).toFixed(1) + "MiB"); // set the status of the fetch
        this.file.appendBuffer(buffer); // append the buffer to the file
    }
}

// Demuxes the first video track of na MP4 file using MP4Box, calling
// 'onConfig' and 'onChunk' as needed
class MP4Demuxer {
    onConfig = null;
    onChunk = null;
    setStatus = null;
    file = null; // this will be the reference to the MP4Box file


    // creates the MP4File and then fetches the video data from the given URI and pipes it to the MP4FileSink
    constructor(uri, { onConfig, onChunk, setStatus }) {
        this.onConfig = onConfig;
        this.onChunk = onChunk; // is called when the file is ready or on the onReady callback
        this.setStatus = setStatus;

        // Configure on MP4Box File for demuxing.
        this.file = MP4Box.createFile();
        this.file.onError = error => setStatus("demux", error);
        this.file.onReady = this.onReady.bind(this);
        this.file.onSamples = this.onSamples.bind(this);

        // Fetch the file and prepare to pipe the data through
        // const fileSink = new MP4FileSink(this.file, setStatus);
        // const response =  fetch(uri);
        // console.log(response);
        // await fetch(uri).then(response => () => {

        //     // highWaterMark should be large enough for smooth streaming, but lower is better for memory usage
        //     console.log("Starting fetch of video data");
        //     response.body.pipeTo(new WritableStream(fileSink, { highWaterMark: 2 })); // pipe the data to the file sink
        // })
        this.useFileSink(uri);
    }

    async useFileSink(uri) {
        const fileSink = new MP4FileSink(this.file, this.setStatus);
        const response = await fetch(uri);
        response.body.pipeTo(new WritableStream(fileSink, { highWaterMark: 2 })); // pipe the data to the file sink which will then trigger the parsing by the mp4Box file
    }

    // Get the approriate 'description' for a specific track. Assumes that the 
    // track is H.264, H.265, VP8, VP9, or AVI.
    description(track) {
        const trak = this.file.getTrackById(track.id);
        for (const entry of trak.mdia.minf.stbl.stsd.entries) {
            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
            if (box) {
                // return box;
                const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                box.write(stream);
                const configDesc = new Uint8Array(stream.buffer, 8); // remove the box header
                // console.log("Found codec description", configDesc);
                return configDesc;
            }

            throw new Error("avcC, hvcC, vpcC, or av1C box not found");
        }
    }

    // this finally configures the demuxer and calls the onConfig callback in the start function with the video configuration
    onReady(info) { // info comes from the MP4Box object
        this.setStatus("demux", "Ready");
        const track = info.videoTracks[0];
        const trackHeight = track.video.height;
        const trackWidth = track.video.width;
        const codecHere = track.codec.startsWith('vp08') ? 'vp8' : track.codec;
        const description = this.description(track);

        // Generate and emit an appropriate VideoDecoderConfig.
        this.onConfig({
            // Browser dosent support parsing full vp8 codec (eg: 'vp08.00.41.08'),
            // theyonly support 'vp*'.
            codec: codecHere,
            codedHeight: trackHeight, // works without these two too
            codedWidth: trackWidth,
            description: description,
        }); // calls the onConfig callback

        // set extraction config
        this.file.setExtractionOptions(track.id, null, { nbSamples: 30 });
        this.file.start(); // start the extraction
    }

    onSamples(track_id, ref, samples) {
        // Generate and emit an EncodedVideoChunk for each demuxed sample.
        for (const sample of samples) {
            // console.log("Demuxed sample", sample);
            this.onChunk(new EncodedVideoChunk({ // calls the onChunk callback
                type: sample.is_sync ? "key" : "delta",
                timestamp: 1e6 * sample.cts / sample.timescale,
                duration: 1e6 * sample.duration / sample.timescale,
                data: sample.data
            }));
        }
        // const sample = samples[0]; // for testing just take the first sample
        // this.onChunk(new EncodedVideoChunk({ // calls the onChunk callback
        //     type: sample.is_sync ? "key" : "delta",
        //     timestamp: 1e6 * sample.cts / sample.timescale,
        //     duration: 1e6 * sample.duration / sample.timescale,
        //     data: sample.data
        // }));
    }
}

// ------------------------------------------------------------
self.addEventListener("message", message => {
    console.log("Message received in worker:", message.data);
    start(message.data.dataUri, message.data.offscreenCanvas);
    console.log("workers work is done"),
        { once: true }
})

// Added a placeholder definition for 'setStatus' to resolve the no-undef error
function setStatus(statusType, message) {
    console.log(`[${statusType}] ${message}`);
}