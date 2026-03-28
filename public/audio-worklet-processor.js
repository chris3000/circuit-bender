/**
 * CircuitAudioProcessor — an AudioWorkletProcessor that receives
 * audio sample data via its message port and outputs it in real-time.
 * Uses a ring buffer (Float32Array) with bitmask indexing for O(1) reads.
 */
class CircuitAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = new Float32Array(65536); // Power of 2 for bitmask
    this.readPos = 0;
    this.writePos = 0;
    this.mask = 65535; // 65536 - 1

    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        const samples = event.data.samples;
        for (let i = 0; i < samples.length; i++) {
          this.queue[this.writePos & this.mask] = samples[i];
          this.writePos++;
        }
        // Cap: if too far ahead, snap read position
        if (this.writePos - this.readPos > 48000) {
          this.readPos = this.writePos - 48000;
        }
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];

    for (let i = 0; i < channel.length; i++) {
      if (this.readPos < this.writePos) {
        channel[i] = this.queue[this.readPos & this.mask];
        this.readPos++;
      } else {
        channel[i] = 0;
      }
    }

    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitAudioProcessor);
