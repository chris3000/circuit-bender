/// <reference path="./audioworklet.d.ts" />

import { MNASolver } from '../solver/MNASolver';
import type { SerializedComponent } from '../solver/MNASolver';
import { createStandardModels } from '../models/standardModels';
import type { DiodeModel } from '../models/DiodeModel';
import { RenderLoad } from './RenderLoad';

class CircuitSimulationProcessor extends AudioWorkletProcessor {
  private solver: MNASolver;
  private running = false;
  private components: SerializedComponent[] = [];
  private probes: Array<{ componentId: string; pinId: string }> = [];
  private probeSampleBuffers: Float32Array[] = [];
  private ledFrameCount = 0;
  private load = new RenderLoad(sampleRate);

  constructor() {
    super();
    this.solver = new MNASolver(createStandardModels());

    this.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'loadCircuit') {
        this.components = msg.components;
        this.solver.loadCircuit(msg.components, msg.connections);
        this.load.reset();
      } else if (msg.type === 'setParam') {
        const comp = this.components.find((c: SerializedComponent) => c.id === msg.componentId);
        if (comp) {
          comp.parameters[msg.key] = msg.value;
          this.solver.updateParam(msg.componentId, msg.key, Number(msg.value));
        }
      } else if (msg.type === 'setBend') {
        // A jumper held between two points of the playing circuit, or let go (null)
        if (msg.bend) this.solver.setBend(msg.bend.from, msg.bend.to, msg.bend.ohms);
        else this.solver.setBend(null, null);
      } else if (msg.type === 'setProbes') {
        this.probes = msg.probes || [];
        this.probeSampleBuffers = this.probes.map(() => new Float32Array(128));
        this.solver.setProbes(this.probes);
      } else if (msg.type === 'setOversampling') {
        this.solver.setOversampling(msg.count);
      } else if (msg.type === 'start') {
        this.running = true;
        this.load.reset();
      } else if (msg.type === 'stop') {
        this.running = false;
        this.solver.resetState();
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][], _parameters: Record<string, Float32Array>): boolean {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;
    const dt = 1 / sampleRate;
    if (this.running) this.load.begin();

    for (let i = 0; i < channel.length; i++) {
      if (this.running) {
        channel[i] = this.solver.step(dt);
        for (let p = 0; p < this.probes.length; p++) {
          this.probeSampleBuffers[p][i] = this.solver.getProbeSample(p);
        }
      } else {
        channel[i] = 0;
        for (let p = 0; p < this.probes.length; p++) {
          this.probeSampleBuffers[p][i] = 0;
        }
      }
    }

    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    if (this.running) {
      const msg: Record<string, unknown> = { type: 'samples', samples: channel.slice() };
      if (this.probes.length > 0) {
        msg.probeData = this.probeSampleBuffers.map(buf => buf.slice());
      }
      this.port.postMessage(msg);

      this.ledFrameCount += channel.length;
      if (this.ledFrameCount >= 800) {
        this.ledFrameCount = 0;
        const ledStates: Record<string, boolean> = {};
        for (const comp of this.components) {
          if (comp.type === 'led') {
            const model = this.solver.getModel(comp.id);
            if (model && 'isLit' in model) {
              ledStates[comp.id] = (model as DiodeModel).isLit();
            }
          }
        }
        if (Object.keys(ledStates).length > 0) {
          this.port.postMessage({ type: 'ledStates', states: ledStates });
        }
      }

      // How much of the time there was to compute this sound it took
      const load = this.load.end(channel.length);
      if (load !== null) this.port.postMessage({ type: 'load', load });
    }
    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitSimulationProcessor);
