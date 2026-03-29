/// <reference path="./audioworklet.d.ts" />

import { MNASolver } from '../solver/MNASolver';
import type { SerializedComponent } from '../solver/MNASolver';
import { ModelRegistry } from '../models/ModelRegistry';
import { ResistorModel } from '../models/ResistorModel';
import { CapacitorModel } from '../models/CapacitorModel';
import { PotentiometerModel } from '../models/PotentiometerModel';
import { PowerSourceModel } from '../models/PowerSourceModel';
import { GroundModel } from '../models/GroundModel';
import { AudioOutputModel } from '../models/AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '../models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '../models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '../models/OpAmpModel';
import { SchmittTriggerModel } from '../models/SchmittTriggerModel';
import { SwitchModel } from '../models/SwitchModel';

function createRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  reg.register('switch', () => new SwitchModel());
  return reg;
}

class CircuitSimulationProcessor extends AudioWorkletProcessor {
  private solver: MNASolver;
  private running = false;
  private components: SerializedComponent[] = [];
  private probes: Array<{ componentId: string; pinId: string }> = [];
  private probeSampleBuffers: Float32Array[] = [];
  private ledFrameCount = 0;

  constructor() {
    super();
    this.solver = new MNASolver(createRegistry());

    this.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'loadCircuit') {
        this.components = msg.components;
        this.solver.loadCircuit(msg.components, msg.connections);
      } else if (msg.type === 'setParam') {
        const comp = this.components.find((c: SerializedComponent) => c.id === msg.componentId);
        if (comp) comp.parameters[msg.key] = msg.value;
      } else if (msg.type === 'setProbes') {
        this.probes = msg.probes || [];
        this.probeSampleBuffers = this.probes.map(() => new Float32Array(128));
      } else if (msg.type === 'setSubcycles') {
        this.solver.setSubcycles(msg.count);
      } else if (msg.type === 'start') {
        this.running = true;
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

    for (let i = 0; i < channel.length; i++) {
      if (this.running) {
        channel[i] = this.solver.step(dt);
        for (let p = 0; p < this.probes.length; p++) {
          const probe = this.probes[p];
          this.probeSampleBuffers[p][i] = this.solver.getNodeVoltageByPin(probe.componentId, probe.pinId);
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
    }
    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitSimulationProcessor);
