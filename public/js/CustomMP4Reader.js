class CustomMP4Reader {
    constructor() {
        console.log("CustomMP4Reader initialized");
        this.parser = new MP4Parser();
        this.tracks = new Map();
        this.file = null;
    }

    async loadFile(file) {
        this.file = file;
        const parseResult = await this.parser.parseFile(file); // this goes inside the MP4Parser class
        //returns 
        // return {
        //     mdatOffset: this.mdatOffset,
        //     mdatSize: this.mdatSize
        // };

        const mdatOffset = parseResult.mdatOffset;
        const mdatSize = parseResult.mdatSize;

        console.log(`mdatOffset: ${mdatOffset}, mdatSize: ${mdatSize}`);
        return { mdatOffset, mdatSize };
        // // Process each track
        // parseResult.tracks.forEach(track => {
        //     if (track.sampleTable) {
        //         const processor = new SampleTableProcessor(
        //             track.sampleTable,
        //             parseResult.mdatOffset
        //         );

        //         this.tracks.set(track.id, {
        //             ...track,
        //             processor
        //         });

        //         console.log(`Track ${track.id}: ${processor.samples.length} samples`);
        //     }
        // });

        // return Array.from(this.tracks.values());
    }
}