/**
 * AudioEngine manages the Web Audio API AudioContext lifecycle and
 * communicates with an AudioWorkletProcessor for real-time playback.
 */
export class AudioEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;

  constructor() {
    this.context = new AudioContext();
  }

  getState(): AudioContextState {
    return this.context.state;
  }

  getSampleRate(): number {
    return this.context.sampleRate;
  }

  /**
   * Loads the audio worklet module, creates an AudioWorkletNode,
   * and connects it to the audio destination.
   */
  async initialize(): Promise<void> {
    await this.context.audioWorklet.addModule('/audio-worklet-processor.js');
    this.workletNode = new AudioWorkletNode(this.context, 'circuit-audio-processor');
    this.workletNode.connect(this.context.destination);
  }

  async resume(): Promise<void> {
    await this.context.resume();
  }

  async suspend(): Promise<void> {
    await this.context.suspend();
  }

  /**
   * Sends audio samples to the worklet processor via its message port.
   */
  sendSamples(samples: Float32Array): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage(
      { type: 'samples', samples },
      [samples.buffer]
    );
  }

  /**
   * Disconnects the worklet node and closes the AudioContext.
   */
  async close(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    await this.context.close();
  }
}
