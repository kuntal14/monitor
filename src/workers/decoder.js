importScripts("../../public/js/mp4box.all.min.js")

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
    write(chunk){ // chunk is the encoded video data
        const buffer = new ArrayBuffer(chunk.byteLength); // allocate the video chunk
        new Uint8Array(buffer).set(chunk); // get a Uint8Array view over the ArrayBuffer

        // we gotta inform the MP4Box where in the file this chunk is frome, basically its id
        buffer.fileStart = this.#offset; // set the file start
        this.#offset += chunk.bytelength;

        // Append chunk
        this.#setStatus("fetch", (this.#offset / (1024**2)).toFixed(1)+"MiB"); // set the status of the fetch
        this.#file.appendBuffer(buffer); // append the buffer to the file

    }


}

