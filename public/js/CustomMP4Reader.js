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

    async getSample(trackId, sampleIndex) {
        const track = this.tracks.get(trackId);
        if (!track) throw new Error('Track not found');

        const sampleInfo = track.processor.getSample(sampleIndex);
        if (!sampleInfo) throw new Error('Sample not found');

        // Read only this sample's bytes from the original file
        const blob = this.file.slice(sampleInfo.offset, sampleInfo.offset + sampleInfo.size);
        const data = await blob.arrayBuffer();

        return {
            ...sampleInfo,
            data,
            trackId
        };
    }

    async getSampleRange(trackId, startSample, endSample) {
        const samples = [];
        for (let i = startSample; i < endSample; i++) {
            samples.push(await this.getSample(trackId, i));
        }
        return samples;
    }

    async getSampleAtTime(trackId, timeInSeconds) {
        const track = this.tracks.get(trackId);
        if (!track) throw new Error('Track not found');

        const sampleIndex = track.processor.timeToSample(timeInSeconds, track.timescale);
        return await this.getSample(trackId, sampleIndex);
    }

    getKeyframes(trackId) {
        const track = this.tracks.get(trackId);
        if (!track) return [];

        return track.processor.samples
            .map((sample, index) => ({ ...sample, index }))
            .filter(sample => sample.isKeyframe);
    }
}