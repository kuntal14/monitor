/* eslint-env worker */
/* global VideoDecoder, MP4Box, EncodedVideoChunk, DataStream, CustomMP4Reader */
self.module = {}; // polyfill for module
importScripts("/js/mp4box.all.min.js");
// Load local helper scripts in dependency order so they expose globals used by CustomMP4Reader
importScripts("/js/MP4Parser.js");
importScripts("/js/SampleTableProcessor.js");
importScripts("/js/CustomMP4Reader.js");

let renderer = null; // what rendering method, could be cpu (in this case), or webGPU, webGL, etc.
// let pendingFrame = null; // the frame that is currently being processed
// let startTime = null;
// let frameCount = 0;
let decoder = null;
// let gpuWorker = null;
// let count = 0;
// let pendingStatus = null; // this is the status that will be sent to the main thread

// entry for the worker
// Startup the renderer -> and initiate the decoder
async function start(dataURI, canvas) {
    // i have chosen the 2D renderer, most prolly the CPU
    console.log("Initializing custom mp4reader");
    const mp4Reader = new CustomMP4Reader(); // creates a custom parser instance

    // range request
    // getting the first 10 MiBs
    const metaData = await fetch(dataURI, {
        method: "HEAD",
    });

    // get the size of the file from the headers
    const fileSize = metaData.headers.get("Content-Length");
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
                Range: `bytes=0-${end}`,
            },
        });
    }

    if (response.status !== 206) {
        console.log("Server does not support range requests");
    }

    const blob = await response.blob();
    await mp4Reader.loadFile(blob);

    if (!renderer) {
        renderer = new Canvas2DRenderer(canvas); // this sets up the CPU to render and get the constext of the display canvas
    }
    console.log("Renderer initialized");
    // setting up the video decoder
    decoder = new VideoDecoder({
        async output(frame) {
            // call the displayFrame worker but only once
            
            self.postMessage({
                    frame: frame,
                }, [frame]);
            // renderFrame(frame);s
        },
        error(e) {
            console.error("Decoder error:", e);
            // Don't throw here - just log the error
            // The decoder will enter "closed" state, which we check before sending more frames
        },
    });

    // now define the DEMUXER
    // demux gets the video chunks and it sends it to the decoder to decode the the frame
    // fetch and demux the media data
    console.log("Starting demuxer");
    // eslint-disable-next-line no-unused-vars
    const demuxer = new MP4Demuxer(dataURI, {
        onConfig(config) {
            // console.log("Configuring decoder with", config);
            decoder.configure(config);
        },
        onChunk(chunk) {
            // const decodedSample = decoder.decode(chunk);
            // console.log("Decoded sample", decodedSample);
            decoder.decode(chunk);
        },
        setStatus,
    });
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
    write(chunk) {
        // chunk is the encoded video data
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
    sampleTable = null;
    keyFrames = null;
    dataURI = null;

    // custom checker hashset
    hs = {};
    // creates the MP4File and then fetches the video data from the given URI and pipes it to the MP4FileSink
    constructor(uri, { onConfig, onChunk, setStatus }) {
        this.onConfig = onConfig;
        this.onChunk = onChunk; // is called when the file is ready or on the onReady callback
        this.setStatus = setStatus;
        this.dataURI = uri;

        // Configure on MP4Box File for demuxing.
        this.file = MP4Box.createFile();
        this.file.onError = (error) => setStatus("demux", error);
        this.file.onReady = this.onReady.bind(this);
        this.file.onSamples = this.onSamples.bind(this);

        this.useFileSink(uri);
    }

    async useFileSink(uri) {
        // this uses the file sink to write  the video to the mp4box file
        const fileSink = new MP4FileSink(this.file, this.setStatus);
        const response = await fetch(uri);
        response.body.pipeTo(new WritableStream(fileSink, { highWaterMark: 2 })); // pipe the data to the file sink which will then trigger the parsing by the mp4Box file
    }

    // Get the approriate 'description' for a specific track. Assumes that the
    // track is H.264, H.265, VP8, VP9, or AVI.
    description(track) {
        const trak = this.file.getTrackById(track.id);
        // get the sample table
        this.sampleTable = this.getSamples(trak);
        this.keyFrames = this.getKeyFrames(trak);

        for (const entry of trak.mdia.minf.stbl.stsd.entries) {
            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
            if (box) {
                // return box;
                const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                box.write(stream);
                const configDesc = new Uint8Array(stream.buffer, 8); // remove the box header // size and type
                // console.log("Found codec description", configDesc);
                return configDesc;
            }

            throw new Error("avcC, hvcC, vpcC, or av1C box not found");
        }
    }

    // this finally configures the demuxer and calls the onConfig callback in the start function with the video configuration
    onReady(info) {
        // info comes from the MP4Box object
        this.setStatus("demux", "Ready");
        const track = info.videoTracks[0];
        const trackHeight = track.video.height;
        const trackWidth = track.video.width;
        const codecHere = track.codec.startsWith("vp08") ? "vp8" : track.codec;
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

        // call the function to decode the first block
        this.renderFirstBlock();
        // set extraction config
        // this.file.setExtractionOptions(track.id, null, { nbSamples: 30 });
        // this.file.start(); // start the extraction
    }

    onSamples(track_id, ref, samples) {
        // Generate and emit an EncodedVideoChunk for each demuxed sample.
        for (const sample of samples) {
            // console.log("Demuxed sample", sample);
            this.onChunk(
                new EncodedVideoChunk({
                    // calls the onChunk callback
                    type: sample.is_sync ? "key" : "delta",
                    timestamp: (1e6 * sample.cts) / sample.timescale,
                    duration: (1e6 * sample.duration) / sample.timescale,
                    data: sample.data,
                })
            );
        }
    }

    getSamples(trak) {
        return trak.samples ? structuredClone(trak.samples) : []; // returns the deepcopy to be stored as a new file
    }

    getKeyFrames(trak) {
        return trak.mdia.minf.stbl.stss.sample_numbers
            ? structuredClone(trak.mdia.minf.stbl.stss.sample_numbers)
            : []; // returns the deepcopy to be stored as a new file
    }

    // this will slice the video to get the first block (block here basically means the video samples between two keyframes)
    renderFirstBlock() {
        // get the first and the second keyframes

        // get the offset of the first keyframe and the second keyframe with its size
        // example sample
        //         {
        //     "number": 0,
        //     "track_id": 1,
        //     "timescale": 15360,
        //     "alreadyRead": 0,
        //     "size": 909,
        //     "chunk_index": 1,
        //     "chunk_run_index": 0,
        //     "description_index": 0,
        //     "description": "desc",
        //     "offset": 48,
        //     "dts": 0,
        //     "cts": 1024,
        //     "is_sync": true,
        //     "is_leading": 0,
        //     "depends_on": 0,
        //     "is_depended_on": 0,
        //     "has_redundancy": 0,
        //     "degradation_priority": 0,
        //     "duration": 512
        // }

        const firstKeyFrame = this.keyFrames[0];
        const secondKeyFrame = this.keyFrames[9]; // or the last frame

        const off01 = this.sampleTable[firstKeyFrame - 1].offset; // -1 because the sample numbers are 1-based
        const off02 = this.sampleTable[secondKeyFrame - 1].offset;
        const size02 = this.sampleTable[secondKeyFrame - 1].size;
        // now get the boundingoffset
        const boundingOffset = off02 + size02;
        // let sampleBuff = null;
        // now fetch the video but between these two offsets and then decode the frames
        fetch(this.dataURI, {
            headers: {
                Range: `bytes=${off01}-${boundingOffset}`,
            },
        })
            .then((response) => {
                console.log("loading into memory");
                return response.blob();
            })
            .then(async (blob) => {
                console.log("loaded into memory, now decoding");
                let currSample = firstKeyFrame - 1;
                const totalSamples = secondKeyFrame - firstKeyFrame;

                // Process frames one by one
                for (let i = 0; i < totalSamples; i++) {
                    if (decoder.state === "closed") {
                        console.error("Decoder has closed, stopping decoding process");
                        break;
                    }

                    try {
                        const sampleBlob = blob.slice(
                            this.sampleTable[currSample + i].offset - off01,
                            this.sampleTable[currSample + i].offset - off01 + this.sampleTable[currSample + i].size
                        );

                        // Use a promise to ensure sequential processing
                        await new Promise((resolve) => {
                            this.sendToDecoder(sampleBlob, currSample + i)
                                .then(resolve)
                                .catch(err => {
                                    console.error("Error in frame decoding:", err);
                                    resolve(); // Continue with next frame even if this one fails
                                });
                        });

                        // Optional: Add a small delay between frames to prevent overwhelming the decoder
                        // await new Promise(r => setTimeout(r, 10));
                    } catch (error) {
                        console.error("Error preparing frame:", error);
                    }
                }
            })
            .catch(error => console.error("Error in fetch operation:", error));
    }

    // Update sendToDecoder to return a promise
    async sendToDecoder(blob, currSample = 0) {
        try {
            const buff = await blob.arrayBuffer();
            const chunk = new EncodedVideoChunk({
                type: this.sampleTable[currSample].is_sync ? "key" : "delta",
                timestamp: (1e6 * this.sampleTable[currSample].cts) / this.sampleTable[currSample].timescale,
                duration: (1e6 * this.sampleTable[currSample].duration) / this.sampleTable[currSample].timescale,
                data: buff,
            });

            // Return a promise that resolves when the frame is processed
            return new Promise((resolve, reject) => {
                try {
                    if (decoder.state !== "closed") {
                        decoder.decode(chunk);
                        resolve();
                    } else {
                        reject(new Error("Decoder is closed"));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        } catch (error) {
            console.error("Error in sendToDecoder:", error);
            throw error;
        }
    }
}

// ------------------------------------------------------------
self.addEventListener("message", (message) => {
    start(message.data.dataUri, message.data.offscreenCanvas);
});

// 2D renderer
class Canvas2DRenderer {
    canvas = null;
    ctx = null;

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
    }

    // this draws the frame onto the 2d canvas directly from the video frame
    draw(frame) {
        // Calculate frame aspect ratio
        const frameAspect = frame.displayWidth / frame.displayHeight;
        // Calculate canvas aspect ratio
        const canvasAspect = this.canvas.width / this.canvas.height;

        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

        // First clear the entire canvas with black (this creates the black background for letterboxing)
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Determine if we need letterboxing (black bars on top/bottom) or pillarboxing (black bars on sides)
        if (frameAspect > canvasAspect) {
            // Video is wider than canvas (relative to height) - use full width and add letterboxing
            drawWidth = this.canvas.width;
            drawHeight = this.canvas.width / frameAspect;
            offsetY = (this.canvas.height - drawHeight) / 2;

        } else {
            // Video is taller than canvas (relative to width) - use full height and add pillarboxing
            drawHeight = this.canvas.height;
            drawWidth = this.canvas.height * frameAspect;
            offsetX = (this.canvas.width - drawWidth) / 2;

        }

        // Draw the frame with the calculated dimensions and position
        this.ctx.drawImage(
            frame,
            0, 0, frame.displayWidth, frame.displayHeight,  // Source rectangle
            offsetX, offsetY, drawWidth, drawHeight         // Destination rectangle
        );

        frame.close();
    }
}


// renderer takes in the frame and draws it, this is called once per animation frame
// function renderAnimationFrame() {
//     renderer.draw(pendingFrame);
//     pendingFrame = null;
// }

// method to call the request animation frame with the previous pending frame
// function renderFrame(frame) {
//     if (!pendingFrame) {
//         console.log("rendering on canvas 0")
//         requestAnimationFrame(renderAnimationFrame);
//     } else {
//         // close the pending frame before replacing it to free up resources
//         pendingFrame.close();
//     }

//     // set the new pending frame
//     pendingFrame = frame;
// }

// Added a placeholder definition for 'setStatus' to resolve the no-undef error
function setStatus(statusType, message) {
    console.log(`[${statusType}] ${message}`);
}
