importScripts("../../public/js/mp4box.all.min.js")

// Startup -> entry for the worker
function start({ dataURI, rendererName, canvas }) {
    // i have chosen the 2D renderer, most prolly the CPU
    renderer = new Canvas2DRenderer(canvas); // this sets up the CPU to render and get the constext of the display canvas

    // setting up the video decoder
    const decoder = new VideoDecoder({
        // output is the option which takes in a callback function that further decides what happens with the decoded frame
        output(frame) {
            //update the status
            if (startTime == null) {
                startTime = performance.now(); //this is the time when the decoding starts
            } else {
                // this particular instance has been decoding videos for a while
                const elapsed = (performance.now() - startTime) / 1000; // get the elapsed time in seconds
                const fps = ++frameCount / elapsed; // calculate the frames per second
                // update the status according to this project
            }

            // schedule the frame to be rendered
            renderFrame(frame);
        },
        error(e) {
            console.log("error decoding the frame in videoDecoder : ", e)
        }
    })
}

// just sends the status back to the main thread, maybe used to track the progress
function statusAnimationFrame() {
    self.postMessage(pendingStatus);
    pendingStatus = null;
}

let renderer = null;
let pendingFrame = null;
let startTime = null;
let frameCount = 0;

// method to render the frame
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

// 2D renderer
class Canvas2DRenderer {
    #canvas = null;
    #ctx = null;

    constructor(canvas) {
        this.#canvas = canvas;
        this.#ctx = canvas.getContext("2d");
    }

    draw(frame) {
        this.#canvas.width = frame.displayWidth;
        this.#canvas.height = frame.displayHeight;
        this.#ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight);
        frame.close();
    }
};



// demux gets the video chunks and it sends it to the decoder to decode the the frame
// fetch and demux the media data

const demuxer = new MP4Demuxer(dataURI, {
    onConfig(config) {
        decoder.configure(config);
    },
    onChunk(chunk) {
        decoder.decode(chunk);
    },
    setStatus
});

self.addEventListener("message", message => {
    startTime(message.data),
        { once: true }
})

// --------------------------------------------------------- DM4DEMUXER

// this is the file sink that is needed in a writable stream

class MP4FileSink {
    #setStatus = null;
    #file = null;
    #offset = 0;

    // this will get the file object and set the status object
    constructor(file, setStatus) {
        this.#file = file;
        this.#setStatus = setStatus;
    }

    // now we create the method to write in the sink
    write(chunk) { // chunk is the encoded video data
        const buffer = new ArrayBuffer(chunk.byteLength); // allocate the video chunk
        new Uint8Array(buffer).set(chunk); // get a Uint8Array view over the ArrayBuffer

        // we gotta inform the MP4Box where in the file this chunk is frome, basically its id
        buffer.fileStart = this.#offset; // set the file start
        this.#offset += chunk.bytelength;

        // Append chunk
        this.#setStatus("fetch", (this.#offset / (1024 ** 2)).toFixed(1) + "MiB"); // set the status of the fetch
        this.#file.appendBuffer(buffer); // append the buffer to the file

    }
}

// Demuxes the first video track of na MP4 file using MP4Box, calling
// 'onConfig' and 'onChunk' as needed
class MP4Demuxer {
    #onConfig = null;
    #onChunk = null;
    #setStatus = null;
    #file = null;

    constructor(uri, { onConfig, onChunk, setStatus }) {
        this.#onConfig = onConfig;
        this.#onChunk = onChunk;
        this.#setStatus = setStatus;

        // Configure on MP4Box File for demuxing.
        this.#file = MP4Box.createFile();
        this.#file.onError = error => setStatus("demux", error);
        this.#file.onReady = this.onReady.bind(this);
        this.#file.onSamples = this.onSamples.bind(this);

        // Fetch the file and pipe the data through
        const fileSink = new MP4FileSink(this.#file, setStatus);
        fetch(uri).then(response => {
            // highWaterMark should be large enough for smooth streaming, but lower is better for memory usage
            response.body.pipeTo(new WritableStream(fileSink, { highWaterMark: 2 })); // pipe the data to the file sink
        })
    }

    // Get the approriate 'description' for a specific track. Assumes that the 
    // track is H.264, H.265, VP8, VP9, or AVI.
    #description(track) {
        const trak = this.#file.getTrackByID(track.id);
        for (const entry of trak.media.minf.stbl.stsd.entries) {
            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
            if (box) {
                const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                box.write(stream);
                return new Uint8Array(stream.buffer, 0); // remove the box header
            }
            throw new Error("avcC, hvcC, vpcC, or av1C box not found");
        }
    }

    #onReady(info) {
        this.#setStatus("demux", "Ready");
        const track = info.videoTracks[0];

        // Generate and emit an appropriate VideoDecoderConfig.
        this.#onConfig({
            // Browser dosent support parsing full vp8 codec (eg: 'vp08.00.41.08'),
            // theyonly support 'vp*'.
            codec: track.coder.stratsWith('vp08') ? 'vp8' : track.codec,
            codedHeight: track.video.heigth,
            codedWidth: track.video.width,
            description: this.#description(track),
        });
    }

    #onSamples(track_id, ref, samples) {
        // Generate and emit an EncodedVideoChunk for each demuxed sample.
        for (const sample of samples) {
            this.#onChunk(new EncodedVideoChunk({
                type: sample.is_sync ? "key" : "delta",
                timestamp: 1e6 * sample.cts / sample.timescale,
                duration: 1e6 * sample.duration / sample.timescale,
                data: sample.data
            }));
        }
    }
}