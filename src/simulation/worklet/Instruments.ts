import type { MNASolver, SerializedComponent } from '../solver/MNASolver';
import type { ComponentModel } from '../models/ComponentModel';
import { SignalMeter, type SignalReading } from '../measure/signal';

/** What the meter is held on: a pin (a wire), or a whole part. */
export interface MeterTarget { componentId: string; pinId?: string }

export interface Range { mean: number; min: number; max: number }

export interface MeterReading {
  /** What was asked for, so a late reading is not shown against a newer choice. */
  target: MeterTarget;
  /** A pin: its voltage. A part with two legs: the voltage across it, first pin to second. */
  volts: SignalReading | null;
  /** A part with two legs that can say: the current through it, first pin to second. */
  amps: Range | null;
}

export interface InstrumentReport {
  /** The current through each LED, in amps, averaged over the last sixtieth of a second. */
  lights?: Record<string, number>;
  /** The parts being driven harder than a real one would stand; sent when the list changes. */
  overloaded?: string[];
  meter?: { probes: SignalReading[]; target: MeterReading | null };
}

/** Lights are reported this often (per second), the meter this often. */
const LIGHT_RATE = 60;
const METER_RATE = 8;
/** Strain is looked at every few samples and averaged over a quarter of a second, as heat is. */
const STRAIN_STRIDE = 8;
const STRAIN_SECONDS = 0.25;
/** A part counts as overloaded above 1, and stops counting below this. */
const STRAIN_RELEASE = 0.8;

type Metered = ComponentModel & { current(x: Float64Array): number };
type Strained = ComponentModel & { strain(x: Float64Array): number };

/**
 * Everything that watches the running circuit without being part of it: how
 * bright each LED is, which parts are overloaded, and the meter (the scope's
 * probes and whatever is selected on the canvas).
 */
export class Instruments {
  private components: SerializedComponent[] = [];
  private lights: Array<{ id: string; model: Metered; sum: number }> = [];
  private lightSamples = 0;
  private strained: Array<{ id: string; model: Strained; level: number; over: boolean }> = [];
  private strainCountdown = 0;
  private overloadChanged = false;
  private readonly strainBlend: number;

  private probes: SignalMeter[] = [];
  private target: MeterTarget | null = null;
  private targetNodes: [number, number] | null = null;
  private targetModel: Metered | null = null;
  private targetVolts: SignalMeter;
  private amps = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
  private meterSamples = 0;

  constructor(private readonly solver: MNASolver, private readonly sampleRate: number) {
    this.strainBlend = 1 - Math.exp(-STRAIN_STRIDE / (sampleRate * STRAIN_SECONDS));
    this.targetVolts = new SignalMeter(sampleRate);
  }

  /** A circuit has been loaded into the solver. */
  load(components: SerializedComponent[]): void {
    this.components = components;
    this.lights = [];
    this.strained = [];
    for (const component of components) {
      const model = this.solver.getModel(component.id);
      if (!model) continue;
      if (component.type === 'led' && model.current) this.lights.push({ id: component.id, model: model as Metered, sum: 0 });
      if (model.strain) this.strained.push({ id: component.id, model: model as Strained, level: 0, over: false });
    }
    this.lightSamples = 0;
    this.strainCountdown = 0;
    this.overloadChanged = true; // whatever was flagged before is gone
    this.setProbes(this.probes.length);
    this.setTarget(this.target);
  }

  /** The solver's probes changed: one reading for each. */
  setProbes(count: number): void {
    this.probes = Array.from({ length: count }, () => new SignalMeter(this.sampleRate));
  }

  setTarget(target: MeterTarget | null): void {
    this.target = target;
    this.targetNodes = null;
    this.targetModel = null;
    this.targetVolts = new SignalMeter(this.sampleRate);
    this.amps = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
    if (!target) return;
    if (target.pinId !== undefined) {
      this.targetNodes = [this.solver.pinNode(target.componentId, target.pinId), -1];
      return;
    }
    const component = this.components.find((c) => c.id === target.componentId);
    if (!component || component.pins.length !== 2) return;
    this.targetNodes = [
      this.solver.pinNode(component.id, component.pins[0].id),
      this.solver.pinNode(component.id, component.pins[1].id),
    ];
    const model = this.solver.getModel(component.id);
    if (model?.current) this.targetModel = model as Metered;
  }

  /** Start again from nothing (the simulation was stopped or restarted). */
  reset(): void {
    this.load(this.components);
  }

  /** Look at the circuit as it is after the audio sample just computed. */
  sample(): void {
    const x = this.solver.getSolutionVector();
    for (let i = 0; i < this.lights.length; i++) this.lights[i].sum += this.lights[i].model.current(x);
    this.lightSamples++;

    if (--this.strainCountdown <= 0) {
      this.strainCountdown = STRAIN_STRIDE;
      for (let i = 0; i < this.strained.length; i++) {
        const part = this.strained[i];
        const now = part.model.strain(x);
        if (Number.isFinite(now)) part.level += (now - part.level) * this.strainBlend;
        const over = part.over ? part.level > STRAIN_RELEASE : part.level > 1;
        if (over !== part.over) {
          part.over = over;
          this.overloadChanged = true;
        }
      }
    }

    for (let p = 0; p < this.probes.length; p++) this.probes[p].add(this.solver.getProbeSample(p));
    if (this.targetNodes) {
      this.targetVolts.add(this.solver.getNodeVoltage(this.targetNodes[0]) - this.solver.getNodeVoltage(this.targetNodes[1]));
    }
    if (this.targetModel) {
      const i = this.targetModel.current(x);
      this.amps.sum += i;
      this.amps.count++;
      if (i < this.amps.min) this.amps.min = i;
      if (i > this.amps.max) this.amps.max = i;
    }
    this.meterSamples++;
  }

  /** Whatever is due to be told to the page, or null. */
  report(): InstrumentReport | null {
    let report: InstrumentReport | null = null;

    if (this.lights.length > 0 && this.lightSamples >= this.sampleRate / LIGHT_RATE) {
      const lights: Record<string, number> = {};
      for (const light of this.lights) {
        lights[light.id] = light.sum / this.lightSamples;
        light.sum = 0;
      }
      this.lightSamples = 0;
      report = { lights };
    } else if (this.lights.length === 0) {
      this.lightSamples = 0;
    }

    if (this.overloadChanged) {
      this.overloadChanged = false;
      report = report ?? {};
      report.overloaded = this.strained.filter((part) => part.over).map((part) => part.id);
    }

    if (this.meterSamples >= this.sampleRate / METER_RATE) {
      this.meterSamples = 0;
      if (this.probes.length > 0 || this.target) {
        report = report ?? {};
        report.meter = { probes: this.probes.map((probe) => probe.read()), target: this.readTarget() };
      }
    }
    return report;
  }

  private readTarget(): MeterReading | null {
    if (!this.target) return null;
    const volts = this.targetNodes ? this.targetVolts.read() : null;
    let amps: Range | null = null;
    if (this.targetModel && this.amps.count > 0) {
      amps = { mean: this.amps.sum / this.amps.count, min: this.amps.min, max: this.amps.max };
      this.amps = { sum: 0, min: Infinity, max: -Infinity, count: 0 };
    }
    return { target: this.target, volts, amps };
  }
}
