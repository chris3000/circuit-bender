/**
 * AudioBridge converts voltage samples to audio samples and buffers them
 * for transfer to the AudioEngine's worklet processor.
 */
export class AudioBridge {
  static readonly BATCH_SIZE = 128;

  private buffer: Float32Array = new Float32Array(AudioBridge.BATCH_SIZE);
  private bufferIndex = 0;
  private flushCallback: ((samples: Float32Array) => void) | null = null;
  private volume = 1;
  private muted = false;

  /**
   * Maps a voltage value to an audio sample in the [-1, 1] range.
   * Formula: (voltage / supplyVoltage) * 2 - 1, clamped to [-1, 1].
   */
  voltageToSample(voltage: number, supplyVoltage: number): number {
    const sample = (voltage / supplyVoltage) * 2 - 1;
    return Math.max(-1, Math.min(1, sample));
  }

  /**
   * Adds a sample to the internal buffer. Volume and mute are applied
   * before buffering. When the buffer reaches BATCH_SIZE, the flush
   * callback is invoked.
   */
  pushSample(sample: number): void {
    const processed = this.muted ? 0 : sample * this.volume;
    this.buffer[this.bufferIndex++] = processed;

    if (this.bufferIndex >= AudioBridge.BATCH_SIZE) {
      if (this.flushCallback) {
        this.flushCallback(this.buffer.slice());
      }
      this.bufferIndex = 0;
    }
  }

  /** Registers a callback invoked when the buffer is full. */
  onBufferReady(callback: (samples: Float32Array) => void): void {
    this.flushCallback = callback;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}
