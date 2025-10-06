class MP4Parser {
    constructor() {
        this.tracks = new Map();
        this.mdatOffset = 0;
        this.mdatSize = 0;
    }

    async parseFile(file) { // this function returns the mdat offset and thats it
        // this already sends the first 10 MB of the file
        // Only read the header portion to get metadata

        const headerBuffer = await file.arrayBuffer(); // load it into memory
        const view = new DataView(headerBuffer);

        let offset = 0;

        while (offset < headerBuffer.byteLength) {
            const box = this.parseBox(view, offset);
            if (!box) break;

            if (box.type === 'moov') {
                this.parseMoovBox(view, box.offset + 8, box.size - 8);
            } else if (box.type === 'mdat') {
                this.mdatOffset = box.offset;
                this.mdatSize = box.size;
                console.log(`Found mdat at offset ${this.mdatOffset}, size ${this.mdatSize}`);
                break; // Stop parsing after mdat
            }

            offset = box.offset + box.size; // offset is the starting of the box and size is the box size
        }

        return {
            mdatOffset: this.mdatOffset,
            mdatSize: this.mdatSize
        };
    }

    // Parses a box from the MP4 file
    parseBox(view, offset) {
        if (offset + 8 > view.byteLength) return null; // the first 8 bytes of the box is the header

        let size = view.getUint32(offset);
        const type = this.uint8ArrayToString(new Uint8Array(view.buffer, offset + 4, 4));

        // Handle 64-bit size
        if (size === 1) {
            size = view.getBigUint64(offset + 8);
            return { size: Number(size), type, offset, headerSize: 16 };
        }

        return { size, type, offset, headerSize: 8 };
    }

    uint8ArrayToString(uint8Array) {
        return Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
    }

    parseMoovBox(view, offset, size) {
        let pos = offset;
        const endPos = offset + size;

        while (pos < endPos) {
            const box = this.parseBox(view, pos);
            if (!box) break;

            if (box.type === 'trak') {
                this.parseTrakBox(view, box.offset + 8, box.size - 8);
            }

            pos = box.offset + box.size;
        }
    }

    parseTrakBox(view, offset, size) {
        const track = {
            id: null,
            type: null,
            codec: null,
            width: 0,
            height: 0,
            timescale: 0,
            duration: 0,
            sampleTable: null
        };

        let pos = offset;
        const endPos = offset + size;

        while (pos < endPos) {
            const box = this.parseBox(view, pos);
            if (!box) break;

            if (box.type === 'tkhd') {
                track.id = this.parseTkhdBox(view, box.offset + 8);
            } else if (box.type === 'mdia') {
                this.parseMdiaBox(view, box.offset + 8, box.size - 8, track);
            }

            pos = box.offset + box.size;
        }

        if (track.id !== null && track.sampleTable) {
            this.tracks.set(track.id, track);
        }
    }

    parseTkhdBox(view, offset) {
        const version = view.getUint8(offset);
        // Skip flags (3 bytes)
        const idOffset = version === 0 ? offset + 4 + 16 : offset + 4 + 32; // Skip creation/modification times
        return view.getUint32(idOffset + 8); // Track ID is at offset +8 from times
    }

    parseMdiaBox(view, offset, size, track) {
        let pos = offset;
        const endPos = offset + size;

        while (pos < endPos) {
            const box = this.parseBox(view, pos);
            if (!box) break;

            if (box.type === 'mdhd') {
                const { timescale, duration } = this.parseMdhdBox(view, box.offset + 8);
                track.timescale = timescale;
                track.duration = duration;
            } else if (box.type === 'hdlr') {
                track.type = this.parseHdlrBox(view, box.offset + 8);
            } else if (box.type === 'minf') {
                this.parseMinfBox(view, box.offset + 8, box.size - 8, track);
            }

            pos = box.offset + box.size;
        }
    }

    parseMdhdBox(view, offset) {
        const version = view.getUint8(offset);
        const flagsOffset = offset + 4;

        if (version === 0) {
            return {
                timescale: view.getUint32(flagsOffset + 8),
                duration: view.getUint32(flagsOffset + 12)
            };
        } else {
            return {
                timescale: view.getUint32(flagsOffset + 16),
                duration: Number(view.getBigUint64(flagsOffset + 20))
            };
        }
    }

    parseHdlrBox(view, offset) {
        const handlerType = this.uint8ArrayToString(new Uint8Array(view.buffer, offset + 8, 4));
        return handlerType === 'vide' ? 'video' : handlerType === 'soun' ? 'audio' : 'text';
    }

    parseMinfBox(view, offset, size, track) {
        let pos = offset;
        const endPos = offset + size;

        while (pos < endPos) {
            const box = this.parseBox(view, pos);
            if (!box) break;

            if (box.type === 'stbl') {
                track.sampleTable = this.parseStblBox(view, box.offset + 8, box.size - 8);
            }

            pos = box.offset + box.size;
        }
    }

    parseStblBox(view, offset, size) {
        const sampleTable = {
            stsd: null, // Sample description
            stts: null, // Time-to-sample
            stss: null, // Sync samples (keyframes)
            stsc: null, // Sample-to-chunk
            stsz: null, // Sample sizes
            stco: null  // Chunk offsets
        };

        let pos = offset;
        const endPos = offset + size;

        while (pos < endPos) {
            const box = this.parseBox(view, pos);
            if (!box) break;

            switch (box.type) {
                case 'stsd':
                    sampleTable.stsd = this.parseStsdBox(view, box.offset + 8);
                    break;
                case 'stts':
                    sampleTable.stts = this.parseSttsBox(view, box.offset + 8);
                    break;
                case 'stss':
                    sampleTable.stss = this.parseStssBox(view, box.offset + 8);
                    break;
                case 'stsc':
                    sampleTable.stsc = this.parseStscBox(view, box.offset + 8);
                    break;
                case 'stsz':
                    sampleTable.stsz = this.parseStszBox(view, box.offset + 8);
                    break;
                case 'stco':
                    sampleTable.stco = this.parseStcoBox(view, box.offset + 8);
                    break;
                case 'co64':
                    sampleTable.stco = this.parseCo64Box(view, box.offset + 8);
                    break;
            }

            pos = box.offset + box.size;
        }

        return sampleTable;
    }

    parseStsdBox(view, offset) {
        // Skip version, flags, entry count
        const entryOffset = offset + 8;
        const entrySize = view.getUint32(entryOffset);
        const codec = this.uint8ArrayToString(new Uint8Array(view.buffer, entryOffset + 4, 4));

        // For video codecs, extract width/height
        if (codec.startsWith('avc') || codec.startsWith('hev') || codec.startsWith('mp4v')) {
            return {
                codec,
                width: view.getUint16(entryOffset + 24),
                height: view.getUint16(entryOffset + 26)
            };
        }

        return { codec };
    }

    parseSttsBox(view, offset) {
        const entryCount = view.getUint32(offset + 4);
        const entries = [];

        for (let i = 0; i < entryCount; i++) {
            const entryOffset = offset + 8 + (i * 8);
            entries.push({
                sampleCount: view.getUint32(entryOffset),
                sampleDuration: view.getUint32(entryOffset + 4)
            });
        }

        return entries;
    }

    parseStssBox(view, offset) {
        const entryCount = view.getUint32(offset + 4);
        const keyframes = [];

        for (let i = 0; i < entryCount; i++) {
            keyframes.push(view.getUint32(offset + 8 + (i * 4)) - 1); // Convert to 0-based
        }

        return keyframes;
    }

    parseStscBox(view, offset) {
        const entryCount = view.getUint32(offset + 4);
        const entries = [];

        for (let i = 0; i < entryCount; i++) {
            const entryOffset = offset + 8 + (i * 12);
            entries.push({
                firstChunk: view.getUint32(entryOffset) - 1, // Convert to 0-based
                samplesPerChunk: view.getUint32(entryOffset + 4),
                sampleDescriptionIndex: view.getUint32(entryOffset + 8)
            });
        }

        return entries;
    }

    parseStszBox(view, offset) {
        const sampleSize = view.getUint32(offset + 4);
        const sampleCount = view.getUint32(offset + 8);

        if (sampleSize !== 0) {
            // All samples have the same size
            return { uniformSize: sampleSize, count: sampleCount };
        }

        // Individual sample sizes
        const sizes = [];
        for (let i = 0; i < sampleCount; i++) {
            sizes.push(view.getUint32(offset + 12 + (i * 4)));
        }

        return { sizes };
    }

    parseStcoBox(view, offset) {
        const entryCount = view.getUint32(offset + 4);
        const offsets = [];

        for (let i = 0; i < entryCount; i++) {
            offsets.push(view.getUint32(offset + 8 + (i * 4)));
        }

        return offsets;
    }

    parseCo64Box(view, offset) {
        const entryCount = view.getUint32(offset + 4);
        const offsets = [];

        for (let i = 0; i < entryCount; i++) {
            offsets.push(Number(view.getBigUint64(offset + 8 + (i * 8))));
        }

        return offsets;
    }


}



// Expose MP4Parser as a global for importScripts consumers (worker/global scope)
try {
    if (typeof self !== 'undefined') self.MP4Parser = MP4Parser;
} catch (e) {
    // ignore in environments without `self`
}


