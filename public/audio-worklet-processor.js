/**
 * CircuitAudioProcessor — an AudioWorkletProcessor that receives
 * audio sample data via its message port and outputs it in real-time.
 */
class CircuitAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleQueue = [];
    this.port.onmessage = (event) => {
      if (event.data.type === 'samples') {
        const incoming = event.data.samples;
        for (let i = 0; i < incoming.length; i++) {
          this.sampleQueue.push(incoming[i]);
        }
        // Cap queue at 48000 samples (1 second at 48 kHz)
        if (this.sampleQueue.length > 48000) {
          this.sampleQueue = this.sampleQueue.slice(this.sampleQueue.length - 48000);
        }
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channel0 = output[0];
    const frameCount = channel0.length;

    for (let i = 0; i < frameCount; i++) {
      if (this.sampleQueue.length > 0) {
        channel0[i] = this.sampleQueue.shift();
      } else {
        // Silence on underrun
        channel0[i] = 0;
      }
    }

    // Copy channel 0 to all other channels (stereo support)
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel0);
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitAudioProcessor);
