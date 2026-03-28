/**
 * AudioEngine manages the Web Audio API AudioContext lifecycle and
 * communicates circuit topology to the AudioWorkletProcessor which
 * runs the simulation at audio sample rate.
 */

interface SerializedComponent {
  id: string;
  type: string;
  pins: Array<{ id: string; label: string; type: string }>;
  parameters: Record<string, number | string | boolean>;
}

interface SerializedConnection {
  id: string;
  from: { componentId: string; pinId: string };
  to: { componentId: string; pinId: string };
}

export class AudioEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private onSamplesCallback: ((samples: Float32Array) => void) | null = null;

  constructor() {
    this.context = new AudioContext();
  }

  getState(): AudioContextState {
    return this.context.state;
  }

  getSampleRate(): number {
    return this.context.sampleRate;
  }

  async initialize(): Promise<void> {
    await this.context.audioWorklet.addModule('/audio-worklet-processor.js?v=' + Date.now());
    this.workletNode = new AudioWorkletNode(this.context, 'circuit-audio-processor');
    this.workletNode.connect(this.context.destination);

    // Listen for messages from worklet
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'samples' && this.onSamplesCallback) {
        this.onSamplesCallback(event.data.samples);
      } else if (event.data.type === 'debug') {
        console.log('[WORKLET]', event.data.msg);
      }
    };
  }

  async resume(): Promise<void> {
    await this.context.resume();
  }

  async suspend(): Promise<void> {
    await this.context.suspend();
  }

  /** Post circuit topology to the worklet for simulation */
  loadCircuit(components: SerializedComponent[], connections: SerializedConnection[]): void {
    console.log('[AudioEngine] loadCircuit:', components.length, 'components,', connections.length, 'connections, workletNode:', !!this.workletNode);
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'loadCircuit',
      components,
      connections,
    });
  }

  /** Update a single component parameter (e.g. potentiometer wiper) */
  setParam(componentId: string, key: string, value: number | string | boolean): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'setParam',
      componentId,
      key,
      value,
    });
  }

  /** Tell the worklet to start/stop simulation */
  startSimulation(): void {
    console.log('[AudioEngine] startSimulation, workletNode:', !!this.workletNode);
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'start' });
  }

  stopSimulation(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'stop' });
  }

  /** Register callback for samples posted back from worklet */
  onSamples(callback: (samples: Float32Array) => void): void {
    this.onSamplesCallback = callback;
  }

  async close(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    await this.context.close();
  }
}
