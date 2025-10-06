

// Sample Table Processor - converts raw tables into usable sample info
class SampleTableProcessor {
    constructor(sampleTable, mdatOffset) {
        this.sampleTable = sampleTable;
        this.mdatOffset = mdatOffset;
        this.samples = [];
        this.buildSampleArray();
    }

    buildSampleArray() {
        const { stts, stsc, stsz, stco, stss } = this.sampleTable;
        const keyframeSet = new Set(stss || []);
        
        let sampleIndex = 0;
        let currentTime = 0;
        
        // Build sample-to-chunk mapping
        const chunkToSamples = this.buildChunkToSamplesMap(stsc, stco?.length || 0);
        
        // Process each chunk
        for (let chunkIndex = 0; chunkIndex < (stco?.length || 0); chunkIndex++) {
            const chunkOffset = stco[chunkIndex];
            const samplesInChunk = chunkToSamples[chunkIndex];
            
            let bytesIntoChunk = 0;
            
            for (let sampleInChunk = 0; sampleInChunk < samplesInChunk; sampleInChunk++) {
                const sampleSize = stsz.uniformSize || stsz.sizes[sampleIndex];
                const duration = this.getSampleDuration(sampleIndex, stts);
                
                this.samples.push({
                    index: sampleIndex,
                    size: sampleSize,
                    offset: chunkOffset + bytesIntoChunk,
                    duration: duration,
                    cts: currentTime,
                    dts: currentTime, // Simplified - no B-frames handling
                    isKeyframe: keyframeSet.has(sampleIndex)
                });
                
                bytesIntoChunk += sampleSize;
                currentTime += duration;
                sampleIndex++;
            }
        }

            // Expose SampleTableProcessor as a global for importScripts consumers (worker/global scope)
            try {
                if (typeof self !== 'undefined') self.SampleTableProcessor = SampleTableProcessor;
            } catch (e) {
                // ignore in environments without `self`
            }
    }

    buildChunkToSamplesMap(stsc, chunkCount) {
        const map = new Array(chunkCount);
        
        for (let i = 0; i < stsc.length; i++) {
            const entry = stsc[i];
            const nextEntry = stsc[i + 1];
            const endChunk = nextEntry ? nextEntry.firstChunk : chunkCount;
            
            for (let chunk = entry.firstChunk; chunk < endChunk; chunk++) {
                map[chunk] = entry.samplesPerChunk;
            }
        }
        
        return map;
    }

    getSampleDuration(sampleIndex, stts) {
        let cumulativeSamples = 0;
        
        for (const entry of stts) {
            if (sampleIndex < cumulativeSamples + entry.sampleCount) {
                return entry.sampleDuration;
            }
            cumulativeSamples += entry.sampleCount;
        }
        
        return stts[stts.length - 1]?.sampleDuration || 0;
    }

    getSample(index) {
        return this.samples[index];
    }

    getSampleRange(start, end) {
        return this.samples.slice(start, end);
    }

    findKeyframeBefore(sampleIndex) {
        for (let i = sampleIndex; i >= 0; i--) {
            if (this.samples[i].isKeyframe) {
                return i;
            }
        }
        return 0;
    }

    timeToSample(timeInSeconds, timescale) {
        const targetTime = timeInSeconds * timescale;
        
        // Binary search
        let low = 0, high = this.samples.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.samples[mid].cts <= targetTime) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return Math.max(0, high);
    }
}