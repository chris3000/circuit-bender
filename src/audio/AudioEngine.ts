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

/**
 * Parameters that are controls rather than part of the circuit: changing one
 * is sent to the running simulation as a parameter update instead of
 * reloading (and so restarting) the whole circuit.
 */
const LIVE_PARAMETERS: Record<string, readonly string[]> = {
  potentiometer: ['position'],
  switch: ['closed'],
  'audio-output': ['gain'],
};

/** Everything about a circuit that the simulation is built from, minus the live controls. */
function structureKey(components: SerializedComponent[], connections: SerializedConnection[]): string {
  return JSON.stringify([
    components.map((c) => {
      const live = LIVE_PARAMETERS[c.type] ?? [];
      const fixed = Object.keys(c.parameters).filter((k) => !live.includes(k)).sort()
        .map((k) => [k, c.parameters[k]]);
      return [c.id, c.type, c.pins.map((p) => p.id), fixed];
    }),
    connections.map((c) => [c.from.componentId, c.from.pinId, c.to.componentId, c.to.pinId]),
  ]);
}

export class AudioEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private outputGain: GainNode | null = null;
  private initializing: Promise<void> | null = null;
  private volume = 1;
  private muted = false;
  private loadedStructure: string | null = null;
  private liveValues = new Map<string, number | string | boolean>();
  private onSamplesCallback: ((samples: Float32Array, probeData?: Float32Array[]) => void) | null = null;
  private onLedStatesCallback: ((states: Record<string, boolean>) => void) | null = null;

  constructor() {
    this.context = new AudioContext();
  }

  getState(): AudioContextState {
    return this.context.state;
  }

  getSampleRate(): number {
    return this.context.sampleRate;
  }

  /** Load the worklet and build the output chain. Safe to call again: it only happens once. */
  initialize(): Promise<void> {
    if (!this.initializing) {
      this.initializing = this.setUp().catch((err) => {
        this.initializing = null; // allow a retry after a failed load
        throw err;
      });
    }
    return this.initializing;
  }

  private async setUp(): Promise<void> {
    // In dev mode, Vite transforms .ts on the fly via its dev server.
    // In production, the audio-worklet-bundle plugin emits a self-contained IIFE.
    const processorUrl = import.meta.env.DEV
      ? new URL('../simulation/worklet/processor.ts', import.meta.url).href
      : new URL('/audio-worklet-processor.js', import.meta.url).href;
    await this.context.audioWorklet.addModule(processorUrl);
    this.workletNode = new AudioWorkletNode(this.context, 'circuit-audio-processor');
    // worklet → master volume → speakers
    this.outputGain = this.context.createGain();
    this.outputGain.gain.value = this.targetGain();
    this.workletNode.connect(this.outputGain);
    this.outputGain.connect(this.context.destination);

    // Listen for messages from worklet
    this.workletNode.port.onmessage = (event) => {
      if (event.data.type === 'samples' && this.onSamplesCallback) {
        this.onSamplesCallback(event.data.samples, event.data.probeData);
      } else if (event.data.type === 'ledStates' && this.onLedStatesCallback) {
        this.onLedStatesCallback(event.data.states);
      }
    };
  }

  async resume(): Promise<void> {
    await this.context.resume();
  }

  async suspend(): Promise<void> {
    await this.context.suspend();
  }

  /** Master volume, 0–1 (slider position; the gain follows an audio taper). */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  private targetGain(): number {
    // Squared: equal slider movements sound like roughly equal loudness steps
    return this.muted ? 0 : this.volume * this.volume;
  }

  private applyGain(): void {
    if (!this.outputGain) return;
    // Short ramp instead of a jump, so changes do not click
    this.outputGain.gain.setTargetAtTime(this.targetGain(), this.context.currentTime, 0.015);
  }

  /** Post circuit topology to the worklet for simulation. Restarts the simulation. */
  loadCircuit(components: SerializedComponent[], connections: SerializedConnection[]): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'loadCircuit',
      components,
      connections,
    });
    this.loadedStructure = structureKey(components, connections);
    this.liveValues.clear();
    for (const c of components) {
      for (const key of LIVE_PARAMETERS[c.type] ?? []) this.liveValues.set(`${c.id}:${key}`, c.parameters[key]);
    }
  }

  /**
   * Bring the running simulation up to date with an edited circuit, without
   * interrupting the sound unless the circuit itself changed: a turned knob
   * or flipped switch is sent as a parameter update, and a part that was only
   * moved on the canvas needs nothing at all.
   */
  updateCircuit(components: SerializedComponent[], connections: SerializedConnection[]): void {
    if (!this.workletNode) return;
    if (structureKey(components, connections) !== this.loadedStructure) {
      this.loadCircuit(components, connections);
      return;
    }
    for (const c of components) {
      for (const key of LIVE_PARAMETERS[c.type] ?? []) {
        const id = `${c.id}:${key}`;
        const value = c.parameters[key];
        if (value === undefined || this.liveValues.get(id) === value) continue;
        this.liveValues.set(id, value);
        this.setParam(c.id, key, value);
      }
    }
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
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'start' });
  }

  stopSimulation(): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'stop' });
  }

  /** Register callback for samples posted back from worklet */
  onSamples(callback: (samples: Float32Array, probeData?: Float32Array[]) => void): void {
    this.onSamplesCallback = callback;
  }

  /** Set probe targets in the worklet */
  setProbes(probes: Array<{ componentId: string; pinId: string }>): void {
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({ type: 'setProbes', probes });
  }

  /** Register callback for LED state updates from worklet */
  onLedStates(callback: (states: Record<string, boolean>) => void): void {
    this.onLedStatesCallback = callback;
  }

  async close(): Promise<void> {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.outputGain) {
      this.outputGain.disconnect();
      this.outputGain = null;
    }
    await this.context.close();
  }
}
