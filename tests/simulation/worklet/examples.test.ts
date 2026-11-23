/**
 * Runs the real example circuits — built by the same code the Examples menu
 * uses and serialized the same way App.tsx does — through the solver.
 * Hand-built test circuits can drift from what the app actually loads; these
 * cannot.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { exampleCircuits } from '@/examples/circuits';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { createStandardModels } from '@/simulation/models/standardModels';
import type { DiodeModel } from '@/simulation/models/DiodeModel';
import type { DecadeCounterModel } from '@/simulation/models/CmosChipModel';
import { ALL_PARTS } from '../../views/allParts';

const SR = 48000;
const DT = 1 / SR;

/** Build an example and hand it to the solver exactly as App.tsx serializes it. */
function load(name: string) {
  const example = exampleCircuits.find(e => e.name === name);
  if (!example) throw new Error(`No example named "${name}"`);
  const { components, connections } = example.build();
  // The same models the worklet has
  const solver = new MNASolver(createStandardModels());
  solver.loadCircuit(
    components.map(c => ({
      id: c.id,
      type: c.type,
      pins: c.pins.map(p => ({ id: p.id, label: p.label, type: p.type })),
      parameters: { ...c.parameters },
    })),
    connections.map(c => ({
      id: c.id,
      from: { componentId: c.from.componentId, pinId: c.from.pinId },
      to: { componentId: c.to.componentId, pinId: c.to.pinId },
    })),
  );
  return { solver, components };
}

function render(solver: MNASolver, seconds: number, settle = 0.25): Float64Array {
  for (let i = 0; i < SR * settle; i++) solver.step(DT);
  const out = new Float64Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length; i++) out[i] = solver.step(DT);
  return out;
}

function measureFrequency(samples: Float64Array): number {
  let first = -1, last = -1, count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      const t = i - 1 + samples[i - 1] / (samples[i - 1] - samples[i]);
      if (first < 0) first = t;
      last = t;
      count++;
    }
  }
  return ((count - 1) / (last - first)) * SR;
}

/** The audio jack's input resistance, which loads the gate output it is wired to. */
const JACK_LOAD = 1e6;

/** CD40106 relaxation oscillator frequency from the model's thresholds and loaded 280Ω output. */
function schmittFrequency(resistance: number, capacitance: number): number {
  const tauR = resistance + (280 * JACK_LOAD) / (280 + JACK_LOAD);
  const vHigh = JACK_LOAD / (280 + JACK_LOAD);   // output high level as a fraction of Vdd
  return 1 / (tauR * capacitance * Math.log((0.59 / 0.40) * ((vHigh - 0.40) / (vHigh - 0.59))));
}

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

describe('example circuits', () => {
  it.each(exampleCircuits.map(e => e.name))('%s: output is finite and never clips', (name) => {
    const { solver } = load(name);
    const samples = render(solver, 0.5);
    let peak = 0;
    for (const s of samples) {
      expect(Number.isFinite(s)).toBe(true);
      peak = Math.max(peak, Math.abs(s));
    }
    expect(peak).toBeLessThan(0.99);
  });

  it.each([
    ['Simple Oscillator', 27000 + 2200, 100e-9],
    ['Oscillator + Op-Amp', 27000 + 2200, 100e-9],
    ['Low Drone', 100000, 100e-9],
    ['High Chirp', 10000, 100e-9],
    ['Pitch Control', 10000 + 0.5 * 100000, 100e-9],
  ])('%s: plays at the pitch its component values give', (name, resistance, capacitance) => {
    const { solver } = load(name);
    const samples = render(solver, 1);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.3);

    const expected = schmittFrequency(resistance, capacitance);
    // The op-amp example loads the oscillator through 100k, shifting it slightly
    const tolerance = name === 'Oscillator + Op-Amp' ? 0.01 : 0.001;
    expect(Math.abs(measureFrequency(samples) / expected - 1)).toBeLessThan(tolerance);
  });

  it('Simple Oscillator is A4', () => {
    const { solver } = load('Simple Oscillator');
    expect(measureFrequency(render(solver, 1))).toBeCloseTo(440.9, 0);
  });

  it('LED Blinker: the LED turns on and off', () => {
    const { solver, components } = load('LED Blinker');
    const led = components.find(c => c.type === 'led')!;
    const model = solver.getModel(led.id) as DiodeModel;
    let lit = 0, dark = 0;
    // Blink period is ~0.77s; watch for 2s in 10ms slices
    for (let slice = 0; slice < 200; slice++) {
      for (let i = 0; i < SR / 100; i++) solver.step(DT);
      if (model.isLit()) lit++; else dark++;
    }
    expect(lit).toBeGreaterThan(20);
    expect(dark).toBeGreaterThan(20);
  });

  it('Pitch Control: turning the pot retunes the oscillator', () => {
    const { solver, components } = load('Pitch Control');
    const pot = components.find(c => c.type === 'potentiometer')!;
    solver.updateParam(pot.id, 'position', 0.1);
    const high = measureFrequency(render(solver, 0.5));
    solver.updateParam(pot.id, 'position', 0.9);
    const low = measureFrequency(render(solver, 0.5));
    expect(Math.abs(high / schmittFrequency(10000 + 10000, 100e-9) - 1)).toBeLessThan(1e-3);
    expect(Math.abs(low / schmittFrequency(10000 + 90000, 100e-9) - 1)).toBeLessThan(1e-3);
  });
});

/**
 * Every example has a switch, so its cover has at least one control. Each is
 * flipped here the way the UI flips it (a live `closed` parameter).
 */
describe('example switches', () => {
  /** Load an example and flip its (only) switch to the other position. */
  function flipped(name: string) {
    const loaded = load(name);
    const toggle = loaded.components.find(c => c.type === 'switch')!;
    loaded.solver.updateParam(toggle.id, 'closed', (toggle.parameters.closed as number) >= 1 ? 0 : 1);
    return loaded;
  }
  const peakOf = (samples: Float64Array) => samples.reduce((peak, s) => Math.max(peak, Math.abs(s)), 0);

  it.each(exampleCircuits.map(e => e.name))('%s has a named switch', (name) => {
    const { components } = exampleCircuits.find(e => e.name === name)!.build();
    const switches = components.filter(c => c.type === 'switch');
    expect(switches.length).toBeGreaterThanOrEqual(1);
    for (const s of switches) expect(s.label).toMatch(/^[A-Z]+$/);
  });

  it('Simple Oscillator: SOUND off is silence', () => {
    expect(peakOf(render(load('Simple Oscillator').solver, 0.25))).toBeGreaterThan(0.3);
    expect(peakOf(render(flipped('Simple Oscillator').solver, 0.25))).toBeLessThan(0.01);
  });

  it('Oscillator + Op-Amp: SOFT halves the volume', () => {
    const loud = peakOf(render(load('Oscillator + Op-Amp').solver, 0.25));
    const soft = peakOf(render(flipped('Oscillator + Op-Amp').solver, 0.25));
    // Gain drops to 0.32, but the loud setting is already held back by the
    // 741's output swing
    expect(soft / loud).toBeGreaterThan(0.4);
    expect(soft / loud).toBeLessThan(0.55);
    expect(soft).toBeGreaterThan(0.1);
  });

  it('Low Drone: SUB drops the pitch an octave', () => {
    const drone = measureFrequency(render(load('Low Drone').solver, 1));
    const sub = measureFrequency(render(flipped('Low Drone').solver, 1));
    expect(Math.abs(sub / drone - 0.5)).toBeLessThan(0.005);
  });

  it('High Chirp: HIGHER lifts the pitch an octave', () => {
    const chirp = measureFrequency(render(load('High Chirp').solver, 0.5));
    const higher = measureFrequency(render(flipped('High Chirp').solver, 0.5));
    // Not quite double: the gate's own 280 Ω output counts for more against 5k
    expect(Math.abs(higher / schmittFrequency(5000, 100e-9) - 1)).toBeLessThan(0.002);
    expect(higher / chirp).toBeGreaterThan(1.9);
  });

  it('Pitch Control: LOW moves the whole range down', () => {
    const normal = measureFrequency(render(load('Pitch Control').solver, 1));
    const low = measureFrequency(render(flipped('Pitch Control').solver, 1));
    expect(Math.abs(low / normal - 100 / 320)).toBeLessThan(0.002);
  });

  it('LED Blinker: FAST blinks about five times as often', () => {
    const blinks = ({ solver, components }: ReturnType<typeof load>) => {
      const model = solver.getModel(components.find(c => c.type === 'led')!.id) as DiodeModel;
      let count = 0, wasLit = model.isLit();
      // 4 s in 5 ms slices
      for (let slice = 0; slice < 800; slice++) {
        for (let i = 0; i < SR / 200; i++) solver.step(DT);
        if (model.isLit() && !wasLit) count++;
        wasLit = model.isLit();
      }
      return count;
    };
    const slow = blinks(load('LED Blinker'));
    const fast = blinks(flipped('LED Blinker'));
    expect(slow).toBeGreaterThanOrEqual(4);
    expect(fast / slow).toBeGreaterThan(4);
    expect(fast / slow).toBeLessThan(7);
  });
});

/**
 * The examples built from the parts that came with the bend tools: timers,
 * counters, a photocell, a push button, body contacts and a speaker.
 */
describe('examples with timers and counters', () => {
  const named = (components: ReturnType<typeof load>['components'], label: string) => components.find(c => c.label === label)!;
  const peakOf = (samples: Float64Array) => samples.reduce((peak, s) => Math.max(peak, Math.abs(s)), 0);
  /** How many times a second a pin goes high, counted on the pin itself. */
  function risesPerSecond(solver: MNASolver, componentId: string, pinId: string, seconds: number, settle = 0.25): number {
    for (let i = 0; i < SR * settle; i++) solver.step(DT);
    let rises = 0, wasHigh = solver.getNodeVoltageByPin(componentId, pinId) > 4;
    const n = Math.round(SR * seconds);
    for (let i = 0; i < n; i++) {
      solver.step(DT);
      const high = solver.getNodeVoltageByPin(componentId, pinId) > 4;
      if (high && !wasHigh) rises++;
      wasHigh = high;
    }
    return rises / seconds;
  }

  describe('Atari Punk Console', () => {
    const NAME = 'Atari Punk Console';
    /** The two timers' output frequencies with the controls as given. */
    function apc(settings: { pitch?: number; width?: number; deep?: number } = {}) {
      const { solver, components } = load(NAME);
      if (settings.pitch !== undefined) solver.updateParam(named(components, 'PITCH').id, 'position', settings.pitch);
      if (settings.width !== undefined) solver.updateParam(named(components, 'WIDTH').id, 'position', settings.width);
      if (settings.deep !== undefined) solver.updateParam(named(components, 'DEEP').id, 'closed', settings.deep);
      const [first, second] = components.filter(c => c.type === 'ne555');
      solver.setProbes([{ componentId: first.id, pinId: first.pins[5].id }, { componentId: second.id, pinId: second.pins[5].id }]);
      for (let i = 0; i < SR * 0.25; i++) solver.step(DT);
      const rises = [0, 0], was = [false, false];
      let peak = 0;
      for (let i = 0; i < SR; i++) {
        peak = Math.max(peak, Math.abs(solver.step(DT)));
        for (let t = 0; t < 2; t++) {
          const high = solver.getProbeSample(t) > 4;
          if (high && !was[t]) rises[t]++;
          was[t] = high;
        }
      }
      return { clock: rises[0], note: rises[1], peak };
    }

    it('runs the first timer at the pitch its parts give', () => {
      // 1.44 / ((RA + 2·RB)·C) with RA 1k, RB 10k + half of 500k, C 10nF
      expect(apc().clock / (1 / (Math.LN2 * (1e3 + 2 * 260e3) * 10e-9))).toBeCloseTo(1, 1);
      expect(apc({ pitch: 0.9 }).clock).toBeGreaterThan(apc({ pitch: 0.1 }).clock * 5);
    });

    it('plays a whole division of that pitch, set by WIDTH', () => {
      for (const width of [0.1, 0.3, 0.5, 0.9]) {
        const { clock, note } = apc({ width });
        const division = clock / note;
        expect(Math.abs(division - Math.round(division))).toBeLessThan(0.1); // counted over a second, to within an edge
        expect(Math.round(division)).toBeGreaterThanOrEqual(1);
      }
      // A longer pulse swallows more cycles: the stepping the circuit is known for
      expect(apc({ width: 0.9 }).note).toBeLessThan(apc({ width: 0.1 }).note / 2);
    });

    it('is loud enough to hear through its speaker', () => {
      expect(apc().peak).toBeGreaterThan(0.2);
    });

    it('DEEP drops it down', () => {
      const plain = apc(), deep = apc({ deep: 1 });
      expect(deep.clock).toBeCloseTo(plain.clock, -1); // the first timer is untouched
      expect(deep.note).toBeLessThan(plain.note / 2);
      expect(deep.note).toBeGreaterThan(20);
    });
  });

  describe('Light Theremin', () => {
    const NAME = 'Light Theremin';
    /** Frequency of a CD4093 gate oscillator with `resistance` round it and 47nF. */
    const pitch = (resistance: number) => schmittFrequency(resistance, 47e-9);
    const cell = (light: number) => 1e6 * Math.pow(1e-3, light);

    it('sings at the pitch the light on its photocell gives', () => {
      const { solver, components } = load(NAME);
      expect(measureFrequency(render(solver, 0.5)) / pitch(4700 + cell(0.5))).toBeCloseTo(1, 2);
      solver.updateParam(named(components, 'LIGHT').id, 'light', 0.9);
      expect(measureFrequency(render(solver, 0.5)) / pitch(4700 + cell(0.9))).toBeCloseTo(1, 2);
      solver.updateParam(named(components, 'LIGHT').id, 'light', 0.2);
      expect(measureFrequency(render(solver, 0.5)) / pitch(4700 + cell(0.2))).toBeCloseTo(1, 2);
    });

    it('DRONE off is silence, until PLAY is held', () => {
      const { solver, components } = load(NAME);
      expect(peakOf(render(solver, 0.25))).toBeGreaterThan(0.3);
      solver.updateParam(named(components, 'DRONE').id, 'closed', 0);
      expect(peakOf(render(solver, 0.25))).toBeLessThan(0.01);
      solver.updateParam(named(components, 'PLAY').id, 'closed', 1);
      const held = render(solver, 0.5, 0.05);
      expect(peakOf(held)).toBeGreaterThan(0.3);
      expect(measureFrequency(held) / pitch(4700 + cell(0.5))).toBeCloseTo(1, 2);
      solver.updateParam(named(components, 'PLAY').id, 'closed', 0);
      expect(peakOf(render(solver, 0.25))).toBeLessThan(0.01);
    });

    it('a finger on TOUCH bends the pitch up, more the harder it presses', () => {
      const { solver, components } = load(NAME);
      solver.updateParam(named(components, 'LIGHT').id, 'light', 0.1); // dim: half a megohm
      const untouched = measureFrequency(render(solver, 1));
      solver.updateParam(named(components, 'TOUCH').id, 'touch', 0.3);
      const light = measureFrequency(render(solver, 1));
      solver.updateParam(named(components, 'TOUCH').id, 'touch', 1);
      const hard = measureFrequency(render(solver, 1));
      expect(light).toBeGreaterThan(untouched * 1.2);
      expect(hard).toBeGreaterThan(light * 1.5);
      // A hard press is 50k across the cell
      expect(hard / pitch(4700 + 1 / (1 / cell(0.1) + 1 / 50e3))).toBeCloseTo(1, 2);
    });
  });

  describe('Octave Organ', () => {
    const NAME = 'Octave Organ';

    it('plays an eighth of its oscillator, and BASS a sixteenth, louder', () => {
      const { solver, components } = load(NAME);
      const osc = components.find(c => c.type === 'cd40106')!;
      const clock = risesPerSecond(solver, osc.id, osc.pins[6].id, 1);
      expect(clock / (1 / ((4700 + 50e3 + 280) * 10e-9 * Math.log((0.59 / 0.40) * (0.60 / 0.41))))).toBeCloseTo(1, 1);

      const plain = render(solver, 1, 0.5);
      expect(measureFrequency(plain) / (clock / 8)).toBeCloseTo(1, 2);
      solver.updateParam(named(components, 'BASS').id, 'closed', 1);
      const bass = render(solver, 1, 0.5);
      expect(measureFrequency(bass) / (clock / 16)).toBeCloseTo(1, 2);
      expect(peakOf(bass)).toBeGreaterThan(peakOf(plain) * 1.5);
      expect(peakOf(plain)).toBeGreaterThan(0.15);
    });

    it('PITCH moves every octave together', () => {
      const { solver, components } = load(NAME);
      const osc = components.find(c => c.type === 'cd40106')!;
      const divider = components.find(c => c.type === 'cd4040')!;
      const at = (position: number) => {
        solver.updateParam(named(components, 'PITCH').id, 'position', position);
        const clock = risesPerSecond(solver, osc.id, osc.pins[6].id, 1);
        const q3 = risesPerSecond(solver, divider.id, divider.pins[4].id, 1);
        return { clock, q3 };
      };
      const low = at(0.2), high = at(0.8);
      // Turning it up takes resistance out of the oscillator
      expect(high.clock / low.clock).toBeCloseTo((4700 + 80e3 + 280) / (4700 + 20e3 + 280), 1);
      expect(low.q3 / (low.clock / 8)).toBeCloseTo(1, 1);
      expect(high.q3 / (high.clock / 8)).toBeCloseTo(1, 1);
    });

    it('idles its amplifier at half the supply, with nothing across the speaker', () => {
      const { solver, components } = load(NAME);
      const amp = components.find(c => c.type === 'lm386')!;
      const speaker = components.find(c => c.type === 'speaker')!;
      // Before a single sample: the 220µF starts charged, so there is no thump
      expect(solver.getNodeVoltageByPin(amp.id, amp.pins[3].id)).toBeGreaterThan(3.5);
      expect(solver.getNodeVoltageByPin(amp.id, amp.pins[3].id)).toBeLessThan(5.5);
      expect(Math.abs(solver.getNodeVoltageByPin(speaker.id, speaker.pins[0].id))).toBeLessThan(0.01);
    });
  });

  describe('Step Sequencer', () => {
    const NAME = 'Step Sequencer';
    /** Run for `seconds`; which steps were visited, and the note played on each. */
    function listen(short: number, seconds: number) {
      const { solver, components } = load(NAME);
      solver.updateParam(named(components, 'SHORT').id, 'closed', short);
      const counter = solver.getModel(components.find(c => c.type === 'cd4017')!.id) as unknown as DecadeCounterModel;
      const led = solver.getModel(components.find(c => c.type === 'led')!.id) as DiodeModel;
      const periods = new Map<number, number[]>();
      const order: number[] = [];
      const litOn = new Set<number>();
      let previous = 0, crossed = -1;
      for (let i = 0; i < SR * seconds; i++) {
        const sample = solver.step(DT);
        const step = counter.getCount();
        if (order[order.length - 1] !== step) { order.push(step); crossed = -1; }
        if (led.isLit()) litOn.add(step);
        if (previous < 0 && sample >= 0) {
          const at = i - 1 + previous / (previous - sample);
          if (crossed >= 0) periods.set(step, [...(periods.get(step) ?? []), at - crossed]);
          crossed = at;
        }
        previous = sample;
      }
      const notes = new Map([...periods].map(([step, all]) => [step, SR / all.sort((a, b) => a - b)[all.length >> 1]]));
      return { order, notes, litOn };
    }

    it('SHORT goes round the first four steps, each with its own note', () => {
      const { order, notes, litOn } = listen(1, 4);
      expect(new Set(order)).toEqual(new Set([0, 1, 2, 3]));
      // In order, round and round
      for (let i = 1; i < order.length; i++) expect(order[i]).toBe((order[i - 1] + 1) % 4);
      expect(order.length).toBeGreaterThan(8);
      const pitches = [0, 1, 2, 3].map((step) => notes.get(step)!);
      // The smaller a step's resistor, the lower its note: 4.7k, 10k, 6.8k, 15k
      expect(pitches[0]).toBeLessThan(pitches[2]);
      expect(pitches[2]).toBeLessThan(pitches[1]);
      expect(pitches[1]).toBeLessThan(pitches[3]);
      for (const [low, high] of [[0, 2], [2, 1], [1, 3]]) expect(pitches[high] / pitches[low]).toBeGreaterThan(1.08);
      expect(pitches[0]).toBeGreaterThan(300);
      expect(pitches[3]).toBeLessThan(1000);
      // The light is on for the first step and no other
      expect([...litOn]).toEqual([0]);
    });

    it('without SHORT there are ten steps, the last six on the top note', () => {
      const { order, notes } = listen(0, 6);
      expect(new Set(order)).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
      for (let i = 1; i < order.length; i++) expect(order[i]).toBe((order[i - 1] + 1) % 10);
      const rest = [4, 5, 6, 7, 8, 9].map((step) => notes.get(step)!);
      for (const pitch of rest) expect(pitch / rest[0]).toBeCloseTo(1, 2);
      expect(rest[0]).toBeGreaterThan(notes.get(3)! * 1.08);
    });

    it('TEMPO sets the pace', () => {
      const pace = (position: number) => {
        const { solver, components } = load(NAME);
        solver.updateParam(named(components, 'TEMPO').id, 'position', position);
        const clock = components.find(c => c.type === 'cd40106')!;
        return risesPerSecond(solver, clock.id, clock.pins[6].id, 6, 0);
      };
      const fast = pace(0.9), slow = pace(0.1);
      expect(fast).toBeGreaterThan(slow * 3);
      expect(slow).toBeGreaterThan(1);
    });
  });
});

/**
 * The WSG is checked against what its schematic says each part does, with the
 * controls set through the same parameter messages the UI sends.
 */
describe('MFOS Weird Sound Generator', () => {
  const NAME = 'MFOS Weird Sound Generator';

  function wsg(settings: Partial<Record<'wacky' | 'zany' | 'zaniness' | 'weird' | 'oddness' | 'wackiness', number>> = {}) {
    const { solver, components } = load(NAME);
    // Pots appear in the example in this order
    const [wacky, zany, zaniness, weird, oddness] = components.filter(c => c.type === 'potentiometer');
    const pots = { wacky, zany, zaniness, weird, oddness };
    for (const [name, value] of Object.entries(settings)) {
      if (name === 'wackiness') solver.updateParam(components.find(c => c.type === 'switch')!.id, 'closed', value);
      else solver.updateParam(pots[name as keyof typeof pots].id, 'position', value);
    }
    const ic = components.find(c => c.type === 'cd40106')!;
    const opamp = components.find(c => c.type === 'lm741')!;
    // Probes: Weird, Wacky and Zany gate outputs, then the op-amp output
    solver.setProbes([
      { componentId: ic.id, pinId: ic.pins[6].id },
      { componentId: ic.id, pinId: ic.pins[7].id },
      { componentId: ic.id, pinId: ic.pins[8].id },
      { componentId: opamp.id, pinId: opamp.pins[3].id },
    ]);
    return { solver, components, opamp };
  }

  /** Run for `seconds` and report each gate's frequency plus the output's swing. */
  function observe(solver: MNASolver, seconds: number, settle = 0.5) {
    for (let i = 0; i < SR * settle; i++) solver.step(DT);
    const n = Math.round(SR * seconds);
    const edges = [0, 0, 0], prev = [0, 0, 0];
    let outMin = Infinity, outMax = -Infinity, peak = 0;
    for (let i = 0; i < n; i++) {
      const sample = solver.step(DT);
      expect(Number.isFinite(sample)).toBe(true);
      peak = Math.max(peak, Math.abs(sample));
      for (let g = 0; g < 3; g++) {
        const v = solver.getProbeSample(g);
        if (i > 0 && prev[g] < 4.5 && v >= 4.5) edges[g]++;
        prev[g] = v;
      }
      const out = solver.getProbeSample(3);
      outMin = Math.min(outMin, out);
      outMax = Math.max(outMax, out);
    }
    return {
      weird: edges[0] / seconds, wacky: edges[1] / seconds, zany: edges[2] / seconds,
      outSwing: outMax - outMin, outCentre: (outMax + outMin) / 2, peak,
    };
  }

  /** Free-running frequency of a gate with `resistance` of feedback, `capacitance` to ground. */
  const rcFrequency = (resistance: number, capacitance: number) =>
    1 / ((resistance + 280) * capacitance * Math.log((0.59 / 0.40) * ((1 - 0.40) / (1 - 0.59))));

  it('starts biased and silent instead of charging up for seconds', () => {
    const { solver, opamp } = wsg();
    // 220 µF on a 50 kΩ divider would take ~30 s to settle from empty
    expect(solver.getNodeVoltageByPin(opamp.id, opamp.pins[1].id)).toBeCloseTo(4.5, 3);
    expect(solver.getNodeVoltageByPin(opamp.id, opamp.pins[3].id)).toBeCloseTo(4.5, 2);
    expect(Math.abs(solver.step(DT))).toBeLessThan(1e-3);
  });

  it('runs all three oscillators at the frequencies their parts give', () => {
    const { solver } = wsg({ wackiness: 0, zaniness: 0.001 });
    const seen = observe(solver, 4);
    // Wacky: R6 + 65% of R1, 22 nF.  Zany: R15 + 40% of R13, 1 µF.  Weird: R7 + R14 + 20% of R9, 22 nF.
    expect(Math.abs(seen.wacky / rcFrequency(4700 + 650e3, 22e-9) - 1)).toBeLessThan(0.01);
    expect(Math.abs(seen.zany / rcFrequency(4700 + 400e3, 1e-6) - 1)).toBeLessThan(0.1);   // few periods in 4 s
    expect(Math.abs(seen.weird / rcFrequency(4700 + 4700 + 200e3, 22e-9) - 1)).toBeLessThan(0.01);
  });

  it('Wackiness gates the Weird oscillator in step with Wacky', () => {
    // D1 holds the Weird input low whenever Wacky is low, so Weird restarts
    // on every Wacky cycle (the "hollow sync" sound)
    const free = observe(wsg({ wackiness: 0, zaniness: 0.001 }).solver, 2);
    const gated = observe(wsg({ wackiness: 1, zaniness: 0.001 }).solver, 2);
    expect(free.weird).toBeGreaterThan(250);
    expect(Math.abs(gated.weird / gated.wacky - 1)).toBeLessThan(0.02);
  });

  it('Zaniness lets Q1 short out the Weird frequency pot, raising the pitch', () => {
    const off = observe(wsg({ wackiness: 0, zaniness: 0.001 }).solver, 2);
    const on = observe(wsg({ wackiness: 0, zaniness: 0.999 }).solver, 2);
    expect(on.weird).toBeGreaterThan(off.weird * 2.5);
  });

  it('puts out line level centred on half supply', () => {
    const seen = observe(wsg().solver, 2);
    expect(seen.outCentre).toBeGreaterThan(4.3);
    expect(seen.outCentre).toBeLessThan(4.7);
    expect(seen.outSwing).toBeGreaterThan(0.2);   // a few hundred millivolts...
    expect(seen.outSwing).toBeLessThan(2);        // ...nowhere near the rails
    expect(seen.peak).toBeGreaterThan(0.08);
    expect(seen.peak).toBeLessThan(0.99);
  });

  it('Oddness is a resonant filter: output peaks when the pitch sits on its corner', () => {
    // With R3 almost fully up the corner is near 2.2 kHz with a strong peak
    // (limited by the 741's bandwidth). A 2 kHz Weird pitch rides it; a
    // 280 Hz one does not.
    const onPeak = observe(wsg({ wackiness: 0, zaniness: 0.001, oddness: 0.999, weird: 0.982 }).solver, 1);
    const offPeak = observe(wsg({ wackiness: 0, zaniness: 0.001, oddness: 0.999, weird: 0.8 }).solver, 1);
    expect(onPeak.weird).toBeGreaterThan(1900);
    expect(onPeak.weird).toBeLessThan(2500);
    expect(onPeak.outSwing).toBeGreaterThan(offPeak.outSwing * 2);
    expect(onPeak.peak).toBeLessThan(0.99);
  });

  it('stays finite and bounded with every control at either extreme', () => {
    for (const v of [0.001, 0.999]) {
      const seen = observe(wsg({ wacky: v, zany: v, zaniness: v, weird: v, oddness: v }).solver, 0.5, 0.1);
      expect(seen.peak).toBeLessThan(1.0001);
    }
  });
});
