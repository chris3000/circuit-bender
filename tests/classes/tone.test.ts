/**
 * Class 13 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { tone as lesson, toneKept, hear, loudest, share, voices, type Heard } from '@/classes/tone';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { capacitor, connect, ground, place, resistor } from '@/examples/circuits';
import { removeFromCircuit, replacePart, spliceIntoWire } from '@/utils/circuitEdits';
import { formatValue } from '@/utils/parameterParser';
import type { Component } from '@/types/circuit';
import type { Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

// --- Finding things on a canvas ---

const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const definition = (type: string) => ALL_PARTS.find((d) => d.type === type)!;
const set = (circuit: Circuit, part: Component, parameters: Component['parameters']) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
const ohms = (circuit: Circuit, part: Component, value: number) => set(circuit, part, { resistance: value, value: formatValue(value, 'resistance') });
const farads = (circuit: Circuit, part: Component, value: number) => set(circuit, part, { capacitance: value, value: formatValue(value, 'capacitance') });
const turn = (circuit: Circuit, knob: Component, position: number) => set(circuit, knob, { position });
const resistorOf = (circuit: Circuit, value: number) => all(circuit, 'resistor').filter((r) => Math.abs(Number(r.parameters.resistance) - value) < value * 0.01);
const capacitorOf = (circuit: Circuit, value: number) => all(circuit, 'capacitor').filter((c) => Math.abs(Number(c.parameters.capacitance) - value) < value * 0.01);
/** The wire from one part's pin to another part. */
const wire = (circuit: Circuit, a: Component, pinA: number, b: Component) => {
  const found = circuit.getConnections().find((c) =>
    (c.from.componentId === a.id && c.from.pinId === a.pins[pinA].id && c.to.componentId === b.id)
    || (c.to.componentId === a.id && c.to.pinId === a.pins[pinA].id && c.from.componentId === b.id));
  if (!found) throw new Error('no such wire');
  return found;
};

const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (circuit: Circuit, situation?: Situation) => lesson.build.filter((s) => s.done(new Work(circuit, situation))).map((s) => s.id);
const kept = (circuit: Circuit, situation?: Situation) => lesson.keep.filter((s) => s.done(new Work(circuit, situation))).map((s) => s.id);
const EMPTY = () => new Circuit('empty');

/** What an Audio Out of a circuit plays: the first, or the one asked for. */
function heard(circuit: Circuit, which = 0): Heard {
  const work = new Work(circuit);
  const result = hear(work, voices(work)[which]);
  if (!result) throw new Error('nothing to hear');
  return result;
}
const two = (value: number) => value.toFixed(2);
const sizes = (h: Heard) => h.sizes.map(two);

// --- The class's circuits ---

const BUFFER = ['buffer', 'lowpass', 'play', 'scope'];
const start = () => classStart(lesson);
const lowPass = () => classStage(lesson, []);
const highPass = () => classStage(lesson, BUFFER);
const toneKnob = () => classStage(lesson, [...BUFFER, 'highpass']);
const whole = () => classCircuit(lesson);
const keptCircuit = () => {
  let circuit = new Circuit('kept');
  const built = toneKept();
  for (const c of built.components) circuit = circuit.addComponent(c);
  for (const c of built.connections) circuit = circuit.addConnection(c);
  return circuit;
};

const CHIP = { A1: 0, A2: 1, A3: 2, Y1: 6, Y2: 7, Y3: 8 };
const AMP = { IN_MINUS: 0, IN_PLUS: 1, V_MINUS: 2, OUT: 3, V_PLUS: 4 };

/** The first filter with another capacitor in it. */
const lowPassWith = (c: number) => { const circuit = lowPass(); return farads(circuit, capacitorOf(circuit, 10e-9)[0], c); };
/** The tone knob: the first pot on the canvas. The filter's is the second. */
const toneKnobOf = (circuit: Circuit) => all(circuit, 'potentiometer')[0];
const filterKnobOf = (circuit: Circuit) => { const pots = all(circuit, 'potentiometer'); return pots[pots.length - 1]; };
/** The tone knob at a position, in the tone knob's own circuit or the whole build. */
const toneAt = (position: number, circuit = toneKnob()) => turn(circuit, toneKnobOf(circuit), position);
/** The whole build with the filter's pot at a position. */
const filterAt = (position: number, circuit = whole()) => turn(circuit, filterKnobOf(circuit), position);

/** A pot's wires moved from its leg 3 to its leg 1: the other way round, as the app's Replace wires one. */
function mirrored(circuit: Circuit, pick: (circuit: Circuit) => Component): Circuit {
  const knob = pick(circuit);
  let result = circuit;
  for (const c of circuit.getConnections()) {
    const from = c.from.componentId === knob.id && c.from.pinId === knob.pins[2].id;
    const to = c.to.componentId === knob.id && c.to.pinId === knob.pins[2].id;
    if (!from && !to) continue;
    const other = circuit.getComponents().find((p) => p.id === (from ? c.to : c.from).componentId)!;
    const otherPin = other.pins.findIndex((p) => p.id === (from ? c.to : c.from).pinId);
    result = result.removeConnection(c.id).addConnection(connect(knob, 0, other, otherPin));
  }
  return result;
}

/** SOUND's wire moved from 2Y back to 1Y. */
function unbuffered(circuit: Circuit): Circuit {
  const chip = only(circuit, 'cd40106'), sound = all(circuit, 'switch')[0];
  return circuit.removeConnection(wire(circuit, chip, CHIP.Y2, sound).id).addConnection(connect(chip, CHIP.Y1, sound, 0));
}

/** The tone knob's voice deleted from the whole build, as the Delete key does it. */
function tidied(circuit = whole()): Circuit {
  const work = new Work(circuit);
  const voice = voices(work)[0];
  const first = [...resistorOf(circuit, 27e3), ...resistorOf(circuit, 2.2e3),
    ...all(circuit, 'capacitor').filter((c) => work.joined(c, 0, only(circuit, 'cd40106'), CHIP.A1))];
  return removeFromCircuit(circuit, [...first, ...voice.parts, voice.out].map((p) => p.id));
}

describe('class 13, tone: what it says', () => {
  it('starts from class 4\'s oscillator, the Simple Oscillator, at 441 Hz', () => {
    const circuit = start();
    expect(lesson.number).toBe(13);
    expect(lesson.id).toBe('tone');
    expect(lesson.unit).toBe('Bigger sound');
    expect(all(circuit, 'cd40106')).toHaveLength(1);
    expect(only(circuit, 'switch').label).toBe('SOUND');
    expect(resistorOf(circuit, 27e3)).toHaveLength(1);
    expect(resistorOf(circuit, 2.2e3)).toHaveLength(1);
    expect(capacitorOf(circuit, 100e-9)).toHaveLength(1);
    expect(heard(circuit).hertz.toFixed(0)).toBe('441');
    // The buffer does not move it
    expect(heard(lowPass()).hertz.toFixed(0)).toBe('441');
    expect(lesson.startsFrom).toContain('441 Hz');
    expect(lesson.why[0].text).toContain('441 Hz');
  });

  it('a square wave is a fundamental of 0.63 and odd harmonics of 0.21, 0.13, 0.09 and 0.07', () => {
    const square = heard(start());
    expect(sizes(square).filter((_, i) => i % 2 === 0)).toEqual(['0.63', '0.21', '0.13', '0.09', '0.07']);
    // The even ones are next to nothing
    for (const even of [1, 3, 5, 7]) expect(square.sizes[even]).toBeLessThan(0.02);
    expect(share(square, 3)).toBeCloseTo(1 / 3, 2);
    expect(lesson.why[0].text).toContain('measures 0.63 and those harmonics 0.21, 0.13, 0.09 and 0.07');
  });

  it('10 kΩ and 10 nF take the third harmonic from 0.21 to 0.16 and the seventh from 0.09 to 0.04: a corner at 1.6 kHz', () => {
    const square = heard(start()), low = heard(lowPass());
    expect(two(low.sizes[2])).toBe('0.16');
    expect(two(low.sizes[6])).toBe('0.04');
    // The corner, by the formula and as each harmonic's loss shows it
    const formula = 1 / (2 * Math.PI * 10e3 * 10e-9);
    expect((formula / 1000).toFixed(1)).toBe('1.6');
    for (const k of [3, 5, 7]) {
      const kept = low.sizes[k - 1] / square.sizes[k - 1];
      const corner = (k * low.hertz) / Math.sqrt(1 / (kept * kept) - 1);
      expect((corner / 1000).toFixed(1)).toBe('1.6');
    }
    expect(formula).toBeGreaterThan(3 * low.hertz);
    const text = lesson.why.find((p) => p.title === 'Low-pass')!.text;
    expect(text).toContain('from 0.21 to 0.16 and the seventh from 0.09 to 0.04');
    const corner = lesson.why.find((p) => p.title === 'The corner')!.text;
    expect(corner).toContain('10 kΩ and 10 nF give 1.6 kHz');
    expect(corner).toContain('above the third harmonic');
  });

  it('swapped, they take the fundamental from 0.63 to 0.17 and leave the seventh harmonic at 0.08', () => {
    const high = heard(highPass());
    expect(two(high.sizes[0])).toBe('0.17');
    expect(two(high.sizes[6])).toBe('0.08');
    expect(lesson.why.find((p) => p.title === 'High-pass')!.text).toContain('from 0.63 to 0.17 while the seventh harmonic only went from 0.09 to 0.08');
  });

  it('the tone knob is bright at one end and dull and quiet at the other, where its corner is at 34 Hz', () => {
    const square = heard(start());
    const bright = heard(toneAt(1)), dull = heard(toneAt(0));
    // Up is brighter, as the step says for a pot on its legs 2 and 3
    expect(share(bright, 3)).toBeGreaterThan(0.25);
    expect(bright.level).toBeGreaterThan(0.45);
    expect(dull.level).toBeLessThan(0.1);
    const left = dull.sizes[0] / square.sizes[0];
    const corner = (dull.hertz * left) / Math.sqrt(1 - left * left);
    expect(corner.toFixed(0)).toBe('34');
    // ...which is what the formula gives for the pot, its 1 kΩ and 47 nF
    expect(1 / (2 * Math.PI * 101e3 * 47e-9)).toBeCloseTo(corner, 0);
    expect(lesson.why.find((p) => p.title === 'The corner')!.text).toContain('the corner is at 34 Hz');
    expect(step(lesson.build, 'knob').how).toContain('up is brighter');
  });

  it('the second oscillator plays 108 Hz, two octaves below the first', () => {
    const circuit = whole();
    const low = heard(circuit, 1), first = heard(circuit, 0);
    expect(low.hertz.toFixed(0)).toBe('108');
    expect(first.hertz.toFixed(0)).toBe('441');
    expect(first.hertz / low.hertz).toBeGreaterThan(3.9);
    expect(first.hertz / low.hertz).toBeLessThan(4.2);
    expect(step(lesson.build, 'second').how).toContain('108 Hz, two octaves below the first');
    expect(resistorOf(circuit, 120e3)).toHaveLength(1);
  });

  it('the op-amp stands on 4.5 V, and the divider hands the filter 0.09 V: a hundredth of the square', () => {
    const circuit = whole();
    const amp = only(circuit, 'lm741'), lower = resistorOf(circuit, 10e3)[0];
    const sound = all(circuit, 'switch')[1];
    const run = new Work(circuit).bench({
      seconds: 0.1, watch: [[amp, AMP.IN_PLUS], [amp, AMP.OUT], [lower, 0]], set: [{ componentId: sound.id, parameter: 'closed', value: 1 }],
    });
    const plus = run.volts(amp.id, amp.pins[AMP.IN_PLUS].id);
    expect(plus.mean.toFixed(2)).toBe('4.50');
    expect(plus.max - plus.min).toBeLessThan(0.001);
    const point = run.volts(lower.id, lower.pins[0].id);
    expect(two(point.max - point.min)).toBe('0.09');
    expect((point.max - point.min) / 9).toBeCloseTo(0.01, 3);
    // The filter never asks the op-amp for more than it can give (1.5 V to 7.5 V)
    const out = run.volts(amp.id, amp.pins[AMP.OUT].id);
    expect(out.min).toBeGreaterThan(1.6);
    expect(out.max).toBeLessThan(7.4);
    expect(step(lesson.build, 'amp').how).toContain('4.5 V');
    expect(step(lesson.build, 'input').how).toContain('about a hundredth, 0.09 V');
  });

  it('with the Weird Sound Generator\'s 1 kΩ in the divider it is a tenth as loud', () => {
    const circuit = filterAt(0.9);
    const quiet = ohms(circuit, resistorOf(circuit, 10e3)[0], 1e3);
    expect(heard(quiet, 1).sizes[2] / heard(circuit, 1).sizes[2]).toBeCloseTo(0.1, 2);
    expect(heard(quiet, 1).level / heard(circuit, 1).level).toBeCloseTo(0.1, 2);
    expect(step(lesson.build, 'input').how).toContain('1 kΩ there and comes out a tenth as loud');
  });

  it('the filter picks out the third harmonic (324 Hz) at 90%, the fifth (540 Hz) at 96%, the seventh (756 Hz) at 98% and the ninth at 99%', () => {
    const at = (position: number) => heard(filterAt(position), 1);
    const pitch = at(0.5).hertz;
    expect([3, 5, 7].map((k) => (k * pitch).toFixed(0))).toEqual(['324', '540', '756']);
    expect(loudest(at(0.9))).toBe(3);
    expect(loudest(at(0.96))).toBe(5);
    expect(loudest(at(0.98))).toBe(7);
    expect(loudest(at(0.99))).toBe(9);
    // Between two harmonics nothing rings, and below 85% nothing has yet
    expect(loudest(at(0.97))).toBe(1);
    for (const position of [0, 0.5, 0.7, 0.85]) expect(loudest(at(position))).toBe(1);
    // At 50% it is a dull note: next to no harmonics
    expect(share(at(0.5), 3)).toBeLessThan(0.1);
    const text = lesson.why.find((p) => p.title === 'Resonance')!.text;
    expect(text).toContain('the 108 Hz note');
    expect(text).toContain('the third at 324 Hz, the fifth at 540 Hz, the seventh at 756 Hz');
    expect(step(lesson.build, 'sweep').how).toContain('above 85%');
    expect(tryOut('ladder').result(new Work(filterAt(0.96)))).toContain('the third at 90%, the fifth at 96%, the seventh at 98%, the ninth at 99%. At 97%');
  });

  it('and rings where 1 ÷ (2π × 470 pF × √(R × 10 MΩ)) says it will', () => {
    const at = (position: number) => heard(filterAt(position), 1);
    const pitch = at(0.5).hertz;
    for (const k of [3, 5]) {
      // The resistance that puts the corner on this harmonic, and where the pot (less its 1 kΩ) has it
      const r = 1 / ((2 * Math.PI * 470e-12 * k * pitch) ** 2 * 10e6);
      const position = 1 - (r - 1e3) / 1e6;
      const reach = k === 3 ? 0.03 : 0.01;
      expect(at(position).sizes[k - 1]).toBeGreaterThan(1.3 * at(position - reach).sizes[k - 1]);
      expect(at(position).sizes[k - 1]).toBeGreaterThan(1.3 * at(position + reach).sizes[k - 1]);
      expect(loudest(at(position))).toBe(k);
    }
    expect(lesson.why.find((p) => p.title === 'Resonance')!.text).toContain('1 ÷ (2π × 470 pF × √(R × 10 MΩ))');
  });

  it('has the parts of a class, in plain punctuation, with every new word listed', () => {
    expect(lesson.build.length).toBeGreaterThanOrEqual(8);
    expect(lesson.build.length).toBeLessThanOrEqual(14);
    expect(new Set([...lesson.build, ...lesson.keep].map((s) => s.id)).size).toBe(lesson.build.length + lesson.keep.length);
    expect(lesson.tries.length).toBeGreaterThanOrEqual(4);
    const text = JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));
    expect(text).not.toMatch(/[—–]/);
    const results = [
      tryOut('dull').result(new Work(toneAt(0))), tryOut('bigger').result(new Work(toneAt(1))), tryOut('unbuffered').result(new Work(unbuffered(toneKnob()))),
      tryOut('third').result(new Work(filterAt(0.9))), tryOut('ladder').result(new Work(filterAt(0.98))),
      lesson.check.reading(new Work(start())),
    ].join(' ');
    expect(results).not.toMatch(/[—–]/);
    expect(lesson.words.map((w) => w.word)).toEqual(
      ['Harmonic', 'Fundamental', 'Pure tone', 'Timbre', 'Filter', 'Low-pass', 'High-pass', 'Corner frequency', 'Resonance']);
    // Nothing in the build uses the words the explanation brings in
    for (const s of lesson.build) expect(`${s.text} ${s.how}`).not.toMatch(/harmonic|fundamental|low-pass|high-pass|corner frequency|resonan|timbre/i);
  });
});

describe('class 13, tone: the experiments', () => {
  it('at its dull end the tone knob is about a tenth as loud, and no purer', () => {
    const circuit = toneAt(0);
    const here = heard(circuit), bright = heard(toneAt(1));
    expect(here.level / bright.level).toBeGreaterThan(0.08);
    expect(here.level / bright.level).toBeLessThan(0.15);
    const experiment = tryOut('dull');
    expect(experiment.options[experiment.answer]).toBe('About a tenth as loud');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Level 0\.06, where the bright end reads 0\.5\d\. .* down from 0\.63 to 0\.05\. .* still 11\.1% of the fundamental/);
    // Not half way, and not at the bright end
    expect(experiment.made(new Work(toneKnob()))).toBe(false);
    expect(experiment.made(new Work(toneAt(1)))).toBe(false);
    // In the whole build, whichever switch is closed
    expect(experiment.made(new Work(toneAt(0, whole())))).toBe(true);
    expect(experiment.made(new Work(whole()))).toBe(false);
    // A pot wired by its other end leg is dull at the top
    const other = mirrored(toneKnob(), toneKnobOf);
    expect(experiment.made(new Work(turn(other, toneKnobOf(other), 1)))).toBe(true);
    expect(experiment.made(new Work(turn(other, toneKnobOf(other), 0)))).toBe(false);
  });

  it('470 nF makes the bright end duller: the third harmonic is 12.5% of the fundamental, where 47 nF had 30%', () => {
    const before = heard(toneAt(1));
    expect((share(before, 3) * 100).toFixed(0)).toBe('30');
    const base = toneAt(1);
    const circuit = farads(base, capacitorOf(base, 47e-9)[0], 470e-9);
    expect((share(heard(circuit), 3) * 100).toFixed(1)).toBe('12.5');
    const experiment = tryOut('bigger');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The third harmonic is 12\.5% of the fundamental here\. With 47 nF it was 30%\./);
    // Not with 47 nF, and not until the knob is at its bright end
    expect(experiment.made(new Work(base))).toBe(false);
    expect(experiment.made(new Work(turn(circuit, toneKnobOf(circuit), 0.5)))).toBe(false);
    expect(experiment.made(new Work(turn(circuit, toneKnobOf(circuit), 0)))).toBe(false);
    // A 470 nF lying loose changes nothing
    expect(experiment.made(new Work(base.addComponent(capacitor(470e-9, 100, 100))))).toBe(false);
  });

  it('without the buffer the tone knob moves the pitch: 432 Hz at the bright end, 440 Hz at the dull end', () => {
    const circuit = unbuffered(toneKnob());
    expect(heard(turn(circuit, toneKnobOf(circuit), 1)).hertz.toFixed(0)).toBe('432');
    expect(heard(turn(circuit, toneKnobOf(circuit), 0)).hertz.toFixed(0)).toBe('440');
    // With it, 441 Hz wherever the knob is
    for (const position of [0, 0.5, 1]) expect(heard(toneAt(position)).hertz.toFixed(0)).toBe('441');
    const experiment = tryOut('unbuffered');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^432 Hz at the bright end and 440 Hz at the dull end\. With the buffer it was 441 Hz/);
    expect(experiment.made(new Work(toneKnob()))).toBe(false);
    expect(experiment.made(new Work(whole()))).toBe(false);
    expect(experiment.made(new Work(unbuffered(whole())))).toBe(true);
  });

  it('at 90% the third harmonic measures 0.13 and the fundamental 0.09', () => {
    const circuit = filterAt(0.9);
    expect(sizes(heard(circuit, 1)).slice(0, 3)).toEqual(['0.09', '0.00', '0.13']);
    const experiment = tryOut('third');
    expect(experiment.options[experiment.answer]).toBe('The third harmonic, 324 Hz');
    expect(experiment.question).toContain('a dull 108 Hz');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^The third harmonic, 324 Hz, measures 0\.13 and the fundamental 0\.09\./);
    expect(experiment.made(new Work(whole()))).toBe(false);
    expect(experiment.made(new Work(filterAt(0.96)))).toBe(false);
    // The other way round, 10% is 90%
    const other = mirrored(whole(), filterKnobOf);
    expect(experiment.made(new Work(turn(other, filterKnobOf(other), 0.1)))).toBe(true);
    expect(experiment.made(new Work(turn(other, filterKnobOf(other), 0.9)))).toBe(false);
    // The tone knob by itself has no filter to turn
    expect(experiment.made(new Work(toneAt(0.9)))).toBe(false);
  });

  it('at 96% the fifth harmonic is loudest, at 98% the seventh', () => {
    const experiment = tryOut('ladder');
    expect(experiment.made(new Work(filterAt(0.96)))).toBe(true);
    expect(experiment.result(new Work(filterAt(0.96)))).toMatch(/^Now the fifth harmonic is the loudest: 540 Hz, at 0\.11\./);
    expect(experiment.made(new Work(filterAt(0.98)))).toBe(true);
    expect(experiment.result(new Work(filterAt(0.98)))).toMatch(/^Now the seventh harmonic is the loudest: 756 Hz, at 0\.09\./);
    for (const position of [0.5, 0.9, 0.97]) expect(experiment.made(new Work(filterAt(position)))).toBe(false);
    const other = mirrored(whole(), filterKnobOf);
    expect(experiment.made(new Work(turn(other, filterKnobOf(other), 0.04)))).toBe(true);
  });

  it('every experiment asks a question with a right answer among its options, and none is made on an empty canvas or at the start', () => {
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(EMPTY()))).toBe(false);
      expect(experiment.made(new Work(start()))).toBe(false);
      expect(experiment.made(new Work(lowPass()))).toBe(false);
    }
  });
});

describe('class 13, tone: the check', () => {
  const reading = (circuit: Circuit) => lesson.check.reading(new Work(circuit));
  const passed = (circuit: Circuit) => lesson.check.passed(new Work(circuit));

  it('the bare square is not pure: too little filtering', () => {
    expect(reading(start())).toBe('Your note: third harmonic 33.3% of the fundamental, level 0.59. Loud enough, but not pure enough: too little filtering.');
    expect(passed(start())).toBe(false);
    expect(reading(lowPass())).toBe('Your note: third harmonic 26.4% of the fundamental, level 0.49. Loud enough, but not pure enough: too little filtering.');
    expect(passed(lowPass())).toBe(false);
  });

  it('the tone knob as built is too quiet: too much filtering', () => {
    for (const circuit of [toneKnob(), whole()]) {
      expect(reading(circuit)).toBe('Your note: third harmonic 11.2% of the fundamental, level 0.11. Pure enough, but too quiet: too much filtering.');
      expect(passed(circuit)).toBe(false);
    }
    expect(passed(toneAt(0))).toBe(false);
  });

  it('is passed where the hint says: the knob near 90%, a corner of about 300 Hz', () => {
    const circuit = toneAt(0.9);
    expect(passed(circuit)).toBe(true);
    expect(reading(circuit)).toBe('Your note: third harmonic 13.1% of the fundamental, level 0.39. Nearly pure, and loud enough.');
    // The hint's sums
    const r = 1 / (2 * Math.PI * 300 * 47e-9);
    expect((r / 1000).toFixed(0)).toBe('11');
    expect(1e3 + 0.1 * 100e3).toBe(11e3);
    expect((3 * heard(circuit).hertz).toFixed(0)).toBe('1323');
    for (const quoted of ['Calculated, not measured', '1,323 Hz', '441 Hz', 'about 11 kΩ', 'near 90%', 'near 10%']) expect(lesson.check.hint).toContain(quoted);
    // ...and near 10% for a pot wired by its other end
    const other = mirrored(toneKnob(), toneKnobOf);
    expect(passed(turn(other, toneKnobOf(other), 0.1))).toBe(true);
    expect(passed(turn(other, toneKnobOf(other), 0.9))).toBe(false);
    // In the whole build too, whichever switches are closed
    expect(passed(toneAt(0.9, whole()))).toBe(true);
    const closed = toneAt(0.9, whole());
    expect(passed(set(closed, all(closed, 'switch')[0], { closed: 1 }))).toBe(true);
  });

  it('too far towards bright fails for the buzz, too far towards dull for the level', () => {
    expect(reading(toneAt(1))).toMatch(/third harmonic 29\.8% of the fundamental, level 0\.5\d\. Loud enough, but not pure enough: too little filtering\.$/);
    expect(passed(toneAt(1))).toBe(false);
    expect(passed(toneAt(0.96))).toBe(false);
    expect(passed(toneAt(0.8))).toBe(true);
    expect(passed(toneAt(0.7))).toBe(false);
    expect(reading(toneAt(0.7))).toMatch(/Pure enough, but too quiet: too much filtering\.$/);
  });

  it('is passed with parts from the shelf alone: 10 kΩ with 47 nF or 100 nF, but not with 22 nF or 220 nF', () => {
    expect(passed(lowPassWith(47e-9))).toBe(true);
    expect(passed(lowPassWith(100e-9))).toBe(true);
    expect(passed(lowPassWith(22e-9))).toBe(false);
    expect(reading(lowPassWith(22e-9))).toMatch(/too little filtering\.$/);
    expect(passed(lowPassWith(220e-9))).toBe(false);
    expect(reading(lowPassWith(220e-9))).toMatch(/too much filtering\.$/);
    const stocked = definition('capacitor').shelf!.stock!;
    for (const value of [47e-9, 100e-9]) expect(stocked.some((s) => Math.abs(s - value) < value * 0.001)).toBe(true);
  });

  it('says so when the filter holds back the wrong end', () => {
    expect(reading(highPass())).toBe('Your note: third harmonic 79.3% of the fundamental, level 0.89. Loud enough, but its harmonics are stronger than the square\'s own: this filter holds back the wrong end.');
    expect(passed(highPass())).toBe(false);
  });

  it('is about the 441 Hz note: the filter\'s 108 Hz does not count, but a resonant filter tuned to 441 Hz does', () => {
    const filter = keptCircuit();
    expect(reading(filter)).toBe('Nothing here plays near 441 Hz: your note is at 108 Hz.');
    expect(passed(filter)).toBe(false);
    // 27 kΩ and 2.2 kΩ make 29.2 kΩ: the filter's oscillator at the first one's pitch, and the corner brought down to it
    const retuned = ohms(filter, resistorOf(filter, 120e3)[0], 29.2e3);
    expect(heard(retuned).hertz.toFixed(0)).toBe('441');
    expect(passed(turn(retuned, filterKnobOf(retuned), 0.94))).toBe(true);
    expect(passed(turn(retuned, filterKnobOf(retuned), 0.5))).toBe(false);
    expect(reading(turn(retuned, filterKnobOf(retuned), 0.5))).toMatch(/too quiet/);
  });

  it('has nothing to read from an empty canvas, or from an Audio Out that is wired to nothing', () => {
    expect(reading(EMPTY())).toBeNull();
    expect(passed(EMPTY())).toBe(false);
    const loose = EMPTY().addComponent(place('audio-output', 0, 0));
    expect(reading(loose)).toBeNull();
    expect(passed(loose)).toBe(false);
  });
});

describe('class 13, tone: the steps', () => {
  it('none are done on an empty canvas, and at the start only what the learner has not yet built is left to do', () => {
    expect(done(EMPTY(), playing)).toEqual(['play']);
    expect(done(EMPTY())).toEqual([]);
    expect(kept(EMPTY())).toEqual([]);
    expect(done(start())).toEqual([]);
    // The SOUND of class 4 is not the filter's switch
    expect(kept(start(), { ...playing, saved: true, view: 'cover' })).toEqual(['cover']);
  });

  it('the buffer: 1Y to 2A, and SOUND moved to 2Y', () => {
    const circuit = start();
    const chip = only(circuit, 'cd40106'), sound = only(circuit, 'switch');
    const joined = circuit.addConnection(connect(chip, CHIP.Y1, chip, CHIP.A2));
    expect(done(joined)).toEqual([]);
    const moved = joined.removeConnection(wire(joined, chip, CHIP.Y1, sound).id).addConnection(connect(chip, CHIP.Y2, sound, 0));
    expect(done(moved)).toEqual(['buffer']);
    expect(heard(moved).hertz.toFixed(0)).toBe('441');
  });

  it('the first filter, made as the step says: a resistor dropped into the wire and a capacitor to ground', () => {
    const base = classStage(lesson, []);
    // Take the stage's filter out again, then put it in the way a learner does
    const sound = only(base, 'switch'), out = only(base, 'audio-output');
    const bare = base.removeComponent(resistorOf(base, 10e3)[0].id).removeComponent(capacitorOf(base, 10e-9)[0].id).addConnection(connect(sound, 1, out, 0));
    expect(done(bare)).toEqual(['buffer']);
    const r = resistor(10e3, 700, 220), c = capacitor(10e-9, 860, 300, 90), g = ground(860, 380);
    const withResistor = spliceIntoWire(bare, r, wire(bare, sound, 1, out).id);
    expect(done(withResistor)).toEqual(['buffer']);
    const built = withResistor.addComponent(c).addComponent(g).addConnection(connect(c, 0, out, 0)).addConnection(connect(c, 1, g, 0));
    expect(done(built)).toEqual(['buffer', 'lowpass']);
    expect(done(built, playing)).toEqual(['buffer', 'lowpass', 'play']);
    // The parts lying on the canvas with no wires are not a filter
    expect(done(bare.addComponent(r).addComponent(c))).toEqual(['buffer']);
    // A capacitor far too small to matter is not one either
    expect(done(lowPassWith(1e-9))).toEqual(['buffer']);
  });

  it('a probe each side of the resistor, while it plays', () => {
    const circuit = lowPass();
    const chip = only(circuit, 'cd40106'), out = only(circuit, 'audio-output');
    const before = { componentId: chip.id, pinId: chip.pins[CHIP.Y2].id }, after = { componentId: out.id, pinId: out.pins[0].id };
    const scope = step(lesson.build, 'scope');
    expect(scope.done(new Work(circuit, { ...playing, probes: [before, after] }))).toBe(true);
    expect(scope.done(new Work(circuit, { ...playing, probes: [before] }))).toBe(false);
    expect(scope.done(new Work(circuit, { ...playing, probes: [after] }))).toBe(false);
    expect(scope.done(new Work(circuit, { playing: false, saved: false, view: 'schematic', selected: [], probes: [before, after] }))).toBe(false);
    // The probe on the far side of SOUND is still the wire from 2Y, as far as the signal goes: it is not
    const sound = only(circuit, 'switch');
    expect(scope.done(new Work(circuit, { ...playing, probes: [{ componentId: sound.id, pinId: sound.pins[1].id }, after] }))).toBe(false);
  });

  it('the two swapped, as the step says: each replaced by the other', () => {
    const base = lowPass();
    const r = resistorOf(base, 10e3)[0], c = capacitorOf(base, 10e-9)[0];
    let swapped = replacePart(base, r.id, definition('capacitor')).circuit;
    swapped = replacePart(swapped, c.id, definition('resistor')).circuit;
    const newC = all(swapped, 'capacitor').find((p) => p.id !== c.id && !capacitorOf(base, 100e-9).some((o) => o.id === p.id))!;
    const newR = all(swapped, 'resistor').find((p) => ![...resistorOf(base, 27e3), ...resistorOf(base, 2.2e3)].some((o) => o.id === p.id))!;
    swapped = ohms(farads(swapped, newC, 10e-9), newR, 10e3);
    expect(done(swapped)).toEqual(['buffer', 'highpass']);
    expect(two(heard(swapped).sizes[0])).toBe('0.17');
    expect(done(highPass())).toEqual(['buffer', 'highpass']);
    // With 100 nF so little is held back that it does not count
    const mild = highPass();
    expect(done(farads(mild, capacitorOf(mild, 10e-9)[0], 100e-9))).toEqual(['buffer']);
  });

  it('deleting the filter\'s capacitor leaves the meeting point where it was, not on ground', () => {
    const base = lowPass();
    const out = only(base, 'audio-output');
    const deleted = removeFromCircuit(base, [capacitorOf(base, 10e-9)[0].id]);
    expect(new Work(deleted).grounded(out, 0)).toBe(false);
    expect(new Work(base).grounded(out, 0)).toBe(false);
  });

  it('the tone knob made as the step says: each part replaced by the other, and the pot wired in by its legs 2 and 3', () => {
    const base = highPass();
    const c = capacitorOf(base, 10e-9)[0], r = resistorOf(base, 10e3)[0];
    const out = only(base, 'audio-output');
    let circuit = replacePart(base, c.id, definition('resistor')).circuit;
    circuit = replacePart(circuit, r.id, definition('capacitor')).circuit;
    const stop = all(circuit, 'resistor').find((p) => ![...resistorOf(base, 27e3), ...resistorOf(base, 2.2e3)].some((o) => o.id === p.id))!;
    const shunt = all(circuit, 'capacitor').find((p) => !capacitorOf(base, 100e-9).some((o) => o.id === p.id))!;
    circuit = farads(ohms(circuit, stop, 1e3), shunt, 47e-9);
    expect(done(circuit)).toEqual(['buffer', 'lowpass']);
    const knob = place('potentiometer', 880, 240, { parameters: { maxResistance: 100e3, value: formatValue(100e3, 'resistance') } });
    const stopFar = [0, 1].find((pin) => new Work(circuit).joined(stop, pin, out, 0))!;
    circuit = circuit.removeConnection(wire(circuit, stop, stopFar, out).id);
    circuit = circuit.addComponent(knob).addConnection(connect(stop, stopFar, knob, 1)).addConnection(connect(knob, 2, out, 0));
    expect(new Work(circuit).joined(shunt, 0, out, 0) || new Work(circuit).joined(shunt, 1, out, 0)).toBe(true);
    expect(done(circuit)).toEqual(['buffer', 'lowpass', 'knob']);
    // Up is brighter, and it is the class's own tone knob to the last figure
    expect(sizes(heard(turn(circuit, knob, 1)))).toEqual(sizes(heard(toneAt(1))));
    expect(heard(turn(circuit, knob, 1)).level).toBeGreaterThan(heard(turn(circuit, knob, 0)).level * 5);
  });

  it('the tone knob, wired by either end leg, and turned', () => {
    const circuit = toneKnob();
    expect(done(circuit)).toEqual(['buffer', 'lowpass', 'knob']);
    expect(done(circuit, playing)).toEqual(['buffer', 'lowpass', 'play', 'knob']);
    expect(done(toneAt(0.1), playing)).toEqual(['buffer', 'lowpass', 'play', 'knob', 'turn']);
    expect(done(toneAt(0.95), playing)).toContain('turn');
    expect(done(toneAt(0.1))).not.toContain('turn');
    const other = mirrored(circuit, toneKnobOf);
    expect(done(other)).toContain('knob');
    // A pot lying loose is no tone knob, and nor is one with the capacitor in line
    expect(done(lowPass().addComponent(place('potentiometer', 100, 100)))).toEqual(['buffer', 'lowpass']);
    expect(done(highPass().addComponent(place('potentiometer', 100, 100)))).not.toContain('knob');
  });

  it('the second oscillator: a low one, beside the first', () => {
    const base = toneKnob();
    const chip = only(base, 'cd40106');
    const withOscillator = (timing: number) => {
      const r = resistor(timing, 440, 500), c = capacitor(100e-9, 160, 340, 90), g = ground(160, 440);
      return base.addComponent(r).addComponent(c).addComponent(g)
        .addConnection(connect(chip, CHIP.Y3, r, 0)).addConnection(connect(r, 1, chip, CHIP.A3))
        .addConnection(connect(c, 0, chip, CHIP.A3)).addConnection(connect(c, 1, g, 0));
    };
    expect(done(withOscillator(120e3))).toEqual(['buffer', 'lowpass', 'knob', 'second']);
    // Another at the first one's pitch is not the low one
    expect(done(withOscillator(29.2e3))).not.toContain('second');
    // The first oscillator by itself is not a second one
    expect(done(base)).not.toContain('second');
  });

  it('the filter goes in a piece at a time: op-amp and half supply, the way in, what goes round it, the way out', () => {
    const circuit = whole();
    const outs = all(circuit, 'audio-output'), amp = only(circuit, 'lm741'), knob = filterKnobOf(circuit), sound = all(circuit, 'switch')[1];
    const id = (parts: Component[]) => parts.map((p) => p.id);
    const without = (ids: string[]) => ids.reduce((left, one) => left.removeComponent(one as Component['id']), circuit);
    const round = [...id(resistorOf(circuit, 10e6)), ...id(capacitorOf(circuit, 470e-12)), knob.id];
    const way = [sound.id, ...id(resistorOf(circuit, 1e6)), ...id(resistorOf(circuit, 750e3))];
    const SO_FAR = ['buffer', 'lowpass', 'knob', 'second'];
    expect(done(without([outs[1].id, ...round, ...way]))).toEqual([...SO_FAR, 'amp']);
    expect(done(without([outs[1].id, ...round]))).toEqual([...SO_FAR, 'amp', 'input']);
    expect(done(without([outs[1].id]))).toEqual([...SO_FAR, 'amp', 'input', 'ring']);
    expect(done(circuit)).toEqual([...SO_FAR, 'amp', 'input', 'ring', 'out']);

    // The op-amp without its large capacitor, or without its power, is not ready
    expect(done(without(id(capacitorOf(circuit, 220e-6))))).not.toContain('amp');
    expect(done(circuit.removeConnection(circuit.getConnections().find((c) => c.to.componentId === amp.id && c.to.pinId === amp.pins[AMP.V_PLUS].id)!.id))).not.toContain('amp');
    expect(done(toneKnob().addComponent(place('lm741', 100, 100)))).not.toContain('amp');
    // The way in needs its switch and its resistor to ground
    expect(done(without([sound.id]))).not.toContain('input');
    expect(done(without(id(resistorOf(circuit, 10e3))))).not.toContain('input');
    // What goes round needs the 10 MΩ, both capacitors and the pot
    expect(done(without(id(resistorOf(circuit, 10e6))))).not.toContain('ring');
    expect(done(without([capacitorOf(circuit, 470e-12)[0].id]))).not.toContain('ring');
    expect(done(without([knob.id]))).not.toContain('ring');
    // ...and without any of them there is no filter to hear
    expect(done(without(id(resistorOf(circuit, 10e6))))).not.toContain('out');
    expect(done(without([knob.id]))).not.toContain('out');
    // The pot by its other end leg is as good
    const other = mirrored(circuit, filterKnobOf);
    expect(done(other)).toEqual([...SO_FAR, 'amp', 'input', 'ring', 'out']);
  });

  it('the filter is played and its pot turned', () => {
    expect(done(filterAt(0.9), playing)).toContain('sweep');
    expect(done(filterAt(0.1), playing)).toContain('sweep');
    expect(done(whole(), playing)).not.toContain('sweep');
    expect(done(filterAt(0.9))).not.toContain('sweep');
    // Turning the tone knob is not turning the filter's
    expect(done(toneAt(0.9, whole()), playing)).not.toContain('sweep');
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['scope', 'highpass', 'turn']);
    expect(all(classStage(lesson, ['buffer']), 'potentiometer')).toHaveLength(0);
    expect(all(classStage(lesson, BUFFER), 'lm741')).toHaveLength(0);
    expect(all(classStage(lesson, [...BUFFER, 'highpass']), 'potentiometer')).toHaveLength(1);
    expect(all(classStage(lesson, [...BUFFER, 'highpass', 'knob']), 'potentiometer')).toHaveLength(1);
    expect(all(classStage(lesson, [...BUFFER, 'highpass', 'knob', 'turn']), 'lm741')).toHaveLength(1);
    expect(all(classStage(lesson, [...BUFFER, 'highpass', 'knob', 'turn', 'second', 'amp']), 'audio-output')).toHaveLength(2);
    // The whole build arrives with the tone knob's SOUND open and the filter's switch closed
    expect(all(whole(), 'switch').map((s) => s.parameters.closed)).toEqual([0, 1]);
  });

  it('every part of every circuit has its value written on it', () => {
    for (const circuit of [lowPass(), highPass(), toneKnob(), whole(), keptCircuit()]) {
      for (const r of all(circuit, 'resistor')) expect(r.parameters.value).toBe(formatValue(Number(r.parameters.resistance), 'resistance'));
      for (const c of all(circuit, 'capacitor')) expect(c.parameters.value).toBe(formatValue(Number(c.parameters.capacitance), 'capacitance'));
      for (const p of all(circuit, 'potentiometer')) expect(p.parameters.value).toBe(formatValue(Number(p.parameters.maxResistance), 'resistance'));
    }
  });

  it('keeping it: the tone knob\'s voice cleared away, the pot named ODDNESS, the switch named SOUND, a look at the cover and a save', () => {
    const circuit = whole();
    expect(kept(circuit)).toEqual([]);
    const tidy = tidied(circuit);
    expect(all(tidy, 'audio-output')).toHaveLength(1);
    expect(kept(tidy)).toEqual(['tidy']);
    expect(loudest(heard(turn(tidy, filterKnobOf(tidy), 0.9)))).toBe(3);
    // Half cleared is not cleared
    expect(kept(circuit.removeComponent(all(circuit, 'audio-output')[0].id))).toEqual([]);

    const named = tidy.updateComponent(only(tidy, 'potentiometer').id, { label: 'oddness' });
    expect(kept(named)).toEqual(['tidy', 'name']);
    const both = named.updateComponent(only(named, 'switch').id, { label: 'Sound' });
    expect(kept(both)).toEqual(['tidy', 'name', 'sound']);
    expect(kept(both, { ...playing, view: 'cover' })).toEqual(['tidy', 'name', 'sound', 'cover']);
    expect(kept(both, { ...playing, saved: true })).toEqual(['tidy', 'name', 'sound', 'save']);
    // In the whole build SOUND is still the tone knob's switch: naming is not done by it
    expect(step(lesson.keep, 'sound').done(new Work(circuit))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(EMPTY(), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps is the filter by itself: ODDNESS picks the harmonic and SOUND turns it on and off', () => {
    const circuit = keptCircuit();
    expect(kept(circuit)).toEqual(['tidy', 'name', 'sound']);
    expect(only(circuit, 'potentiometer').label).toBe('ODDNESS');
    expect(only(circuit, 'switch').label).toBe('SOUND');
    expect(resistorOf(circuit, 1e6)).toHaveLength(1);
    // SOUND sits between the oscillator and the 1 MΩ
    const work = new Work(circuit);
    const sound = only(circuit, 'switch');
    expect(work.joined(sound, 0, only(circuit, 'cd40106'), CHIP.Y3)).toBe(true);
    expect(work.joined(sound, 1, resistorOf(circuit, 1e6)[0], 0)).toBe(true);

    // As kept, at 90%: the third harmonic. Turned: the fundamental alone, then the fifth
    const knob = only(circuit, 'potentiometer');
    expect(knob.parameters.position).toBe(0.9);
    expect(loudest(heard(circuit))).toBe(3);
    expect(loudest(heard(turn(circuit, knob, 0.5)))).toBe(1);
    expect(share(heard(turn(circuit, knob, 0.5)), 3)).toBeLessThan(0.1);
    expect(loudest(heard(turn(circuit, knob, 0.96)))).toBe(5);

    // SOUND closed it plays, open it is silent
    const swing = (closed: number) => {
      const run = work.bench({ seconds: 0.2, set: [{ componentId: sound.id, parameter: 'closed', value: closed }] });
      return run.sound.max - run.sound.min;
    };
    expect(swing(1)).toBeGreaterThan(0.3);
    expect(swing(0)).toBeLessThan(0.002);
    // It is the same thing the tidied build is
    const tidy = tidied();
    expect(heard(circuit).sizes[2]).toBeCloseTo(heard(turn(tidy, filterKnobOf(tidy), 0.9)).sizes[2], 3);
  });
});
