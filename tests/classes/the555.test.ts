/**
 * Class 9 on the bench: every number the class quotes is measured here on
 * the class's own circuits, and every step, experiment and check is tried
 * against circuits a learner might have on the canvas.
 *
 * Pitches are counted on the 555's own output pin at the rate the app plays
 * at (48 kHz), which is what the app's meter shows the learner.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import { the555 as lesson, the555Kept, the555Tone } from '@/classes/the555';
import { classCircuit, classStage, classStart } from '@/classes';
import { Work, type Situation } from '@/classes/Work';
import { CD40106, NE555 } from '@/classes/kit';
import { capacitor, connect, exampleCircuits, ground, place, resistor } from '@/examples/circuits';
import { dutyCycle } from '@/simulation/measure/signal';
import { formatValue } from '@/utils/parameterParser';
import { formatHertz } from '@/utils/readings';
import type { Component } from '@/types/circuit';
import type { Built, Step } from '@/classes/types';
import { ALL_PARTS } from '../views/allParts';

beforeAll(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const def of ALL_PARTS) registry.register(def);
});

type Change = { componentId: string; parameter: string; value: number };

const circuitOf = (built: Built): Circuit => {
  let circuit = new Circuit('mine');
  for (const part of built.components) circuit = circuit.addComponent(part);
  for (const wire of built.connections) circuit = circuit.addConnection(wire);
  return circuit;
};
const all = (circuit: Circuit, type: string) => circuit.getComponents().filter((c) => c.type === type);
const only = (circuit: Circuit, type: string): Component => {
  const parts = all(circuit, type);
  if (parts.length !== 1) throw new Error(`${parts.length} parts of type ${type}`);
  return parts[0];
};
const ohms = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, resistance: value, value: formatValue(value, 'resistance') } });
const farads = (circuit: Circuit, part: Component, value: number) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, capacitance: value, value: formatValue(value, 'capacitance') } });
const param = (circuit: Circuit, part: Component, parameters: Component['parameters']) =>
  circuit.updateComponent(part.id, { parameters: { ...part.parameters, ...parameters } });
/** Every wire taken off one pin of a part. */
const unwire = (circuit: Circuit, part: Component, pin: number): Circuit => circuit.getConnections()
  .filter((c) => [c.from, c.to].some((end) => end.componentId === part.id && end.pinId === part.pins[pin].id))
  .reduce((result, c) => result.removeConnection(c.id), circuit);
const wire = (circuit: Circuit, a: Component, pinA: number, b: Component, pinB: number) => circuit.addConnection(connect(a, pinA, b, pinB));

const playing: Situation = { playing: true, saved: false, view: 'schematic', selected: [] };
const step = (steps: Step[], id: string) => steps.find((s) => s.id === id)!;
const tryOut = (id: string) => lesson.tries.find((t) => t.id === id)!;
const done = (work: Work) => lesson.build.filter((s) => s.done(work)).map((s) => s.id);
const ids = lesson.build.map((s) => s.id);
const upTo = (id: string) => ids.slice(0, ids.indexOf(id) + 1);

/** The four circuits of the build: the blinker, the tone, the tone with the one-shot beside it, and those with the siren. */
const blinker = () => classStage(lesson, []);
const tone = () => classStage(lesson, upTo('probe'));
const withShot = () => classStage(lesson, upTo('listen'));
const siren = () => classCircuit(lesson);
const kept = () => circuitOf(the555Kept());

/** The 555 that makes the tone is the first put down, the one-shot the second. */
const toneTimer = (circuit: Circuit) => all(circuit, 'ne555')[0];
const shotTimer = (circuit: Circuit) => all(circuit, 'ne555')[1];
/** The resistor with a leg on a pin's net, of a given value if asked. */
const resistorOn = (circuit: Circuit, part: Component, pin: number, value?: number): Component => {
  const work = new Work(circuit);
  const net = work.net(part, pin);
  const found = all(circuit, 'resistor').find((r) => (work.net(r, 0) === net || work.net(r, 1) === net)
    && (value === undefined || Number(r.parameters.resistance) === value));
  if (!found) throw new Error('no such resistor');
  return found;
};
/** The tone's second resistor, RB: from DISCH to THRES. */
const rbOf = (circuit: Circuit) => {
  const work = new Work(circuit), timer = toneTimer(circuit);
  return all(circuit, 'resistor').find((r) => [work.net(r, 0), work.net(r, 1)].includes(work.net(timer, NE555.THRES)))!;
};
/** The resistor that leads into CTRL: the one on the switch. */
const pushOf = (circuit: Circuit) => resistorOn(circuit, only(circuit, 'switch'), 0);
const held = (circuit: Circuit, value = 1): Change[] => all(circuit, 'pushbutton').map((b) => ({ componentId: b.id, parameter: 'closed', value }));
const switched = (circuit: Circuit, closed: 0 | 1): Change[] => all(circuit, 'switch').map((s) => ({ componentId: s.id, parameter: 'closed', value: closed }));

/** A 555 output's pitch, counted on the pin itself at 48 kHz. */
function outHertz(circuit: Circuit, timer: Component, set: Change[] = [], seconds = 0.3): number | null {
  const run = new Work(circuit).bench({ seconds, watch: [[timer, NE555.OUT]], set });
  return run.volts(timer.id, timer.pins[NE555.OUT].id).hertz;
}

/** The siren's two pitches, counted on the tone's output while the slow oscillator's output is high and while it is low; and where CTRL goes. */
function sirenPitches(circuit: Circuit, set: Change[] = []) {
  const timer = toneTimer(circuit), chip = only(circuit, 'cd40106');
  const rate = 48000;
  const run = new Work(circuit).bench({ seconds: 2.5, watch: [[timer, NE555.OUT], [timer, NE555.CTRL], [chip, CD40106.Y[0]]], set });
  const out = run.trace(timer.id, timer.pins[NE555.OUT].id)!, slow = run.trace(chip.id, chip.pins[CD40106.Y[0]].id)!;
  const rises: number[] = [];
  for (let i = 1; i < out.length; i++) if (out[i] > 4 && out[i - 1] <= 4) rises.push(i);
  const during = (high: boolean) => {
    let best = [0, 0], from = -1;
    for (let k = 0; k <= rises.length; k++) {
      const ok = k < rises.length && (slow[rises[k]] > 4.5) === high;
      if (ok && from < 0) from = k;
      if (!ok && from >= 0) {
        if (k - 1 - from > best[1] - best[0]) best = [from, k - 1];
        from = -1;
      }
    }
    return (best[1] - best[0]) / ((rises[best[1]] - rises[best[0]]) / rate);
  };
  const ctrl = run.volts(timer.id, timer.pins[NE555.CTRL].id);
  return { whileHigh: during(true), whileLow: during(false), ctrl };
}

/** A tap of the button at 0.1 s, let go at 0.2 s, at 48 kHz: when the LED is lit, and the tone's output all the way through. */
function tap(circuit: Circuit, options: { seconds?: number; letGo?: number; set?: Change[] } = {}) {
  const rate = 48000;
  const led = all(circuit, 'led')[0], timer = toneTimer(circuit);
  const run = new Work(circuit).bench({
    seconds: options.seconds ?? 1.6, set: [...held(circuit, 0), ...(options.set ?? [])],
    watchAmps: led ? [led.id] : [], watch: [[timer, NE555.OUT]],
    events: [...held(circuit, 1).map((e) => ({ ...e, at: 0.1 })), ...held(circuit, 0).map((e) => ({ ...e, at: options.letGo ?? 0.2 }))],
  });
  const amps = led ? run.ampsTrace(led.id)! : new Float32Array(0);
  let first = -1, last = -1;
  for (let i = 0; i < amps.length; i++) if (amps[i] > 1e-4) { if (first < 0) first = i; last = i; }
  const out = run.trace(timer.id, timer.pins[NE555.OUT].id)!;
  const rises: number[] = [];
  for (let i = 1; i < out.length; i++) if (out[i] > 4 && out[i - 1] <= 4) rises.push(i / rate);
  let lastHigh = -1;
  for (let i = 0; i < out.length; i++) if (out[i] > 4) lastHigh = i / rate;
  return { run, litFrom: first / rate, lit: (last + 1 - first) / rate, peak: Math.max(0, ...amps), rises, lastHigh };
}

/** The siren made into the doorbell the hint describes: the tone's RESET on the one-shot's output, 100 kΩ for the 47 kΩ, the switch open. */
function bell(options: { rb?: number; open?: boolean } = {}): Circuit {
  let circuit = siren();
  circuit = wire(unwire(circuit, toneTimer(circuit), NE555.RESET), toneTimer(circuit), NE555.RESET, shotTimer(circuit), NE555.OUT);
  circuit = ohms(circuit, rbOf(circuit), options.rb ?? 100e3);
  return param(circuit, only(circuit, 'switch'), { closed: options.open === false ? 1 : 0 });
}

/** The siren with the resistor into CTRL taken off the slow oscillator and wired to + or to ground. */
function pushed(to: '+' | 'ground'): Circuit {
  const circuit = siren();
  const push = pushOf(circuit);
  const off = unwire(circuit, push, 0);
  return to === '+' ? wire(off, push, 0, only(circuit, 'power'), 0) : wire(off, push, 0, all(circuit, 'ground')[0], 0);
}

/** The tone's RESET taken off + and wired to ground. */
function resetGrounded(circuit = siren(), timer = toneTimer(circuit)): Circuit {
  return wire(unwire(circuit, timer, NE555.RESET), timer, NE555.RESET, all(circuit, 'ground')[0], 0);
}

const text = () => JSON.stringify(lesson, (_key, value) => (typeof value === 'function' ? undefined : value));
const why = (title: string) => lesson.why.find((p) => p.title === title)!.text;

describe('class 9, the 555: what it says', () => {
  it('has the parts of a class, each the size a class should be, and starts from an empty canvas', () => {
    expect(lesson.number).toBe(9);
    expect(lesson.id).toBe('the-555');
    expect(lesson.unit).toBe('Logic and rhythm');
    expect(classStart(lesson).getComponents()).toHaveLength(0);
    expect(lesson.build.length).toBeGreaterThanOrEqual(8);
    expect(lesson.build.length).toBeLessThanOrEqual(14);
    expect(lesson.why.length).toBeGreaterThanOrEqual(4);
    expect(lesson.tries.length).toBeGreaterThanOrEqual(4);
    expect(lesson.words.length).toBeGreaterThanOrEqual(5);
    const stepIds = [...lesson.build, ...lesson.keep].map((s) => s.id);
    expect(new Set(stepIds).size).toBe(stepIds.length);
    for (const s of [...lesson.build, ...lesson.keep]) expect(s.how).toBeTruthy();
  });

  it('keeps to plain punctuation: no dashes, in what it says or in what its experiments report', () => {
    expect(text()).not.toMatch(/[—–]/);
    expect(tryOut('reset').result(new Work(resetGrounded()))).not.toMatch(/[—–]/);
    expect(lesson.check.hint).not.toMatch(/[—–]/);
  });

  it('the blinker runs at 1.46 Hz, as 1.44 ÷ ((RA + 2 × RB) × C) says, and is lit 52% of the time', () => {
    const circuit = blinker();
    const timer = toneTimer(circuit), led = only(circuit, 'led');
    const run = new Work(circuit).bench({ seconds: 6, sampleRate: 8000, watch: [[timer, NE555.OUT]], watchAmps: [led.id] });
    const hertz = run.volts(timer.id, timer.pins[NE555.OUT].id).hertz!;
    expect(hertz.toFixed(2)).toBe('1.46');
    expect((1.44 / ((10e3 + 2 * 100e3) * 4.7e-6)).toFixed(2)).toBe('1.46');
    expect(10e3 + 2 * 100e3).toBe(210000);
    // About three blinks in two seconds
    expect(Math.round(hertz * 2)).toBe(3);
    expect((dutyCycle(run.ampsTrace(led.id)!, 1e-4)! * 100).toFixed(0)).toBe('52');
    expect(step(lesson.build, 'play').how).toContain('1.46 Hz');
    expect(step(lesson.build, 'play').how).toContain('about three times in two seconds');
    expect(why('How fast')).toContain('1.44 ÷ (210,000 Ω × 0.0000047 F) = 1.46 Hz');
    expect(why('A timer')).toContain('lit 52% of the time');
  });

  it('its capacitor goes between 3 V and 6 V, a third and two thirds of the supply, and its output reaches 7.6 V', () => {
    const circuit = blinker();
    const timer = toneTimer(circuit);
    const run = new Work(circuit).bench({ seconds: 4, sampleRate: 8000, watch: [[timer, NE555.THRES], [timer, NE555.OUT], [timer, NE555.CTRL]] });
    // Once it is going: the first cycle starts from wherever the capacitor was
    const trace = run.trace(timer.id, timer.pins[NE555.THRES].id)!.slice(2 * 8000);
    expect(Math.min(...trace).toFixed(2)).toBe('3.00');
    expect(Math.max(...trace).toFixed(2)).toBe('6.00');
    expect(run.volts(timer.id, timer.pins[NE555.CTRL].id).mean).toBeCloseTo(6, 3);
    expect(run.volts(timer.id, timer.pins[NE555.OUT].id).max.toFixed(1)).toBe('7.6');
    expect(run.volts(timer.id, timer.pins[NE555.OUT].id).min).toBeCloseTo(0, 2);
    expect(step(lesson.build, 'probe').how).toContain('climbs to 6 V while the LED is lit and falls back to 3 V');
    for (const quoted of ['two thirds of the supply, 6 V', 'At one third, 3 V']) expect(why('A timer')).toContain(quoted);
    expect(why('A strong output')).toContain('7.6 V');
  });

  it('with 47 kΩ and 10 nF it is a tone of 1.38 kHz, about a thousand times faster, and the LED only looks dimmer', () => {
    const circuit = tone();
    const hertz = outHertz(circuit, toneTimer(circuit))!;
    expect(formatHertz(hertz)).toBe('1.38 kHz');
    expect(Math.round(1.44 / ((10e3 + 2 * 47e3) * 10e-9))).toBe(1385);
    const slow = blinker();
    const blink = new Work(slow).bench({ seconds: 6, sampleRate: 8000, watch: [[toneTimer(slow), NE555.OUT]] })
      .volts(toneTimer(slow).id, toneTimer(slow).pins[NE555.OUT].id).hertz!;
    expect(hertz / blink).toBeGreaterThan(900);
    expect(hertz / blink).toBeLessThan(1100);
    expect(why('How fast')).toContain('1.44 ÷ (104,000 Ω × 0.00000001 F) = 1,385 Hz, the 1.38 kHz on the meter');
    expect(step(lesson.build, 'listen').how).toContain('1.38 kHz');
    expect(step(lesson.build, 'faster').text).toContain('about a thousand times faster');
    // The values changed with the LED still on the output: it is lit a little over half the time, so about half as bright
    let fastBlink = blinker();
    fastBlink = ohms(fastBlink, rbOf(fastBlink), 47e3);
    fastBlink = farads(fastBlink, only(fastBlink, 'capacitor'), 10e-9);
    const led = only(fastBlink, 'led');
    const average = new Work(fastBlink).bench({ seconds: 0.1 }).amps(led.id);
    expect(average * 1000).toBeGreaterThan(2.5);
    expect(average * 1000).toBeLessThan(3.5);
    expect(tap(blinker()).peak * 1000).toBeGreaterThan(5);
    expect(step(lesson.build, 'faster').done(new Work(fastBlink))).toBe(true);
  });

  it('the tone that class 10 starts from is the tone of the build: one 555, its three timing parts and an Audio Out', () => {
    const built = circuitOf(the555Tone());
    expect(built.getComponents().map((c) => c.type).sort()).toEqual(tone().getComponents().map((c) => c.type).sort());
    expect(all(built, 'ne555')).toHaveLength(1);
    expect(all(built, 'audio-output')).toHaveLength(1);
    expect(all(built, 'led')).toHaveLength(0);
    expect(formatHertz(outHertz(built, toneTimer(built))!)).toBe('1.38 kHz');
    expect(new Work(built).bench({ seconds: 0.05 }).sound.max).toBeGreaterThan(0.3);
  });

  it('the one-shot lights its LED for 1.10 s after a tap, as 1.1 × R × C says, and the tone carries on meanwhile', () => {
    const circuit = withShot();
    const result = tap(circuit);
    expect(result.litFrom).toBeCloseTo(0.1, 3);
    expect(result.lit.toFixed(2)).toBe('1.10');
    expect((1.1 * 100e3 * 10e-6).toFixed(1)).toBe('1.1');
    // The tone, counted from before the tap to after the light has gone out
    expect(result.rises[0]).toBeLessThan(0.01);
    expect(result.lastHigh).toBeGreaterThan(1.59);
    expect(formatHertz(outHertz(circuit, toneTimer(circuit))!)).toBe('1.38 kHz');
    // Before the tap the second 555 waits: TRIG held high by its pull-up, the capacitor empty, the output low
    const shot = shotTimer(circuit);
    const waiting = new Work(circuit).bench({ watch: [[shot, NE555.TRIG], [shot, NE555.THRES], [shot, NE555.OUT]] });
    expect(waiting.volts(shot.id, shot.pins[NE555.TRIG].id).mean).toBeGreaterThan(8.9);
    expect(waiting.volts(shot.id, shot.pins[NE555.THRES].id).mean).toBeLessThan(0.1);
    expect(waiting.volts(shot.id, shot.pins[NE555.OUT].id).mean).toBeLessThan(0.1);
    expect(step(lesson.build, 'lamp').how).toContain('stays on for 1.10 s every time');
    expect(why('Waiting')).toContain('1.1 × 100,000 Ω × 0.00001 F = 1.1 s');
  });

  it('held down for longer than that, the button keeps the LED on until it is let go', () => {
    const result = tap(withShot(), { seconds: 2.6, letGo: 2.1 });
    expect(result.lit).toBeCloseTo(2, 2);
    expect(tryOut('shorter').result(new Work(shortShot()))).toContain('The LED stays on until you let go');
  });

  it('the slow oscillator turns over 1.3 times a second, takes CTRL from 6 V to 6.73 V and 4.53 V, and the tone between 1.18 and 1.78 kHz', () => {
    const circuit = siren();
    const chip = only(circuit, 'cd40106'), timer = toneTimer(circuit);
    const alone = new Work(circuit).bench({ seconds: 8, sampleRate: 8000, watch: [[chip, CD40106.Y[0]], [timer, NE555.CTRL]], set: switched(circuit, 0) });
    expect(alone.volts(chip.id, chip.pins[CD40106.Y[0]].id).hertz!.toFixed(1)).toBe('1.3');
    expect(alone.volts(timer.id, timer.pins[NE555.CTRL].id).max).toBeCloseTo(6, 2);
    expect(alone.volts(timer.id, timer.pins[NE555.CTRL].id).min).toBeCloseTo(6, 2);
    const wailing = sirenPitches(circuit);
    expect(wailing.ctrl.max.toFixed(2)).toBe('6.73');
    expect(wailing.ctrl.min.toFixed(2)).toBe('4.53');
    // More voltage on CTRL, lower note
    expect(formatHertz(wailing.whileHigh)).toBe('1.18 kHz');
    expect(formatHertz(wailing.whileLow)).toBe('1.78 kHz');
    expect(step(lesson.build, 'slow').how).toContain('1.3 times a second');
    for (const quoted of ['the 6 V level itself', 'up to 6.73 V and down to 4.53 V', 'between 1.18 kHz and 1.78 kHz']) expect(why('A voltage sets the pitch')).toContain(quoted);
    // With the switch open the tone holds still, where it was
    expect(formatHertz(outHertz(circuit, timer, switched(circuit, 0))!)).toBe('1.38 kHz');
  });

  it('in the app a RESET with nothing on it reads high, and the 555 runs as before', () => {
    const circuit = tone();
    const open = unwire(circuit, toneTimer(circuit), NE555.RESET);
    expect(formatHertz(outHertz(open, toneTimer(open))!)).toBe('1.38 kHz');
    expect(why('On a real board')).toContain('a RESET pin with nothing on it reads high and the chip runs');
  });

  it('the Atari Punk Console is the two together: the second 555 is set off by the first and gives one pulse for every one, two, three or four of its cycles', () => {
    const console = circuitOf(exampleCircuits.find((e) => e.name === 'Atari Punk Console')!.build());
    const [first, second] = all(console, 'ne555');
    const width = all(console, 'potentiometer').find((p) => p.label === 'WIDTH')!;
    expect(all(console, 'potentiometer').some((p) => p.label === 'PITCH')).toBe(true);
    const ratios = [0.1, 0.5, 0.7, 0.9].map((position) => {
      const run = new Work(console).bench({ seconds: 0.5, watch: [[first, NE555.OUT], [second, NE555.OUT]], set: [{ componentId: width.id, parameter: 'position', value: position }] });
      return run.volts(first.id, first.pins[NE555.OUT].id).hertz! / run.volts(second.id, second.pins[NE555.OUT].id).hertz!;
    });
    for (const ratio of ratios) expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(0.01);
    expect(ratios.map(Math.round)).toEqual([1, 2, 3, 4]);
    expect(step(lesson.keep, 'punk').done(new Work(console))).toBe(true);
    expect(step(lesson.keep, 'punk').done(new Work(kept()))).toBe(false);
    expect(step(lesson.keep, 'punk').done(new Work(siren()))).toBe(false);
    expect(lesson.promise).toContain('Atari Punk Console');
  });
});

/** The one-shot with 47 kΩ for its 100 kΩ. */
function shortShot(circuit = siren()): Circuit {
  return ohms(circuit, resistorOn(circuit, shotTimer(circuit), NE555.DISCH), 47e3);
}

describe('class 9, the 555: the experiments', () => {
  it('a one-shot with 47 kΩ stays on for 0.52 s', () => {
    const circuit = shortShot();
    expect(tap(circuit).lit.toFixed(2)).toBe('0.52');
    expect((1.1 * 47e3 * 10e-6).toFixed(2)).toBe('0.52');
    const experiment = tryOut('shorter');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^0\.52 s, where it was 1\.10 s\. .* 1\.1 × 47,000 Ω × 0\.00001 F = 0\.52 s/);
    expect(experiment.made(new Work(siren()))).toBe(false);
    // ...and before the siren is built
    expect(experiment.made(new Work(shortShot(withShot())))).toBe(true);
    // A 47 kΩ lying loose is not the change
    expect(experiment.made(new Work(siren().addComponent(resistor(47e3, 900, 600))))).toBe(false);
  });

  it('on 5 V the tone is the same 1.38 kHz and the one-shot the same 1.10 s', () => {
    const base = siren();
    const circuit = param(base, only(base, 'power'), { voltage: 5 });
    expect(formatHertz(outHertz(circuit, toneTimer(circuit), switched(circuit, 0))!)).toBe('1.38 kHz');
    expect(tap(circuit).lit.toFixed(2)).toBe('1.10');
    // Its two levels are fractions of the supply
    const timer = toneTimer(circuit);
    const run = new Work(circuit).bench({ seconds: 0.1, watch: [[timer, NE555.THRES]], set: switched(circuit, 0) });
    const trace = run.trace(timer.id, timer.pins[NE555.THRES].id)!.slice(2400);
    expect(Math.min(...trace)).toBeCloseTo(5 / 3, 1);
    expect(Math.max(...trace)).toBeCloseTo(10 / 3, 1);
    const experiment = tryOut('flat');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^1\.38 kHz: the same note\. .* still takes 1\.10 s too/);
    expect(experiment.made(new Work(base))).toBe(false);
    // A second supply lying loose and set to 5 V changes nothing
    expect(experiment.made(new Work(base.addComponent(place('power', 900, 600, { parameters: { voltage: 5 } }))))).toBe(false);
  });

  it('10 kΩ from CTRL to + holds it at 6.75 V and the tone at 1.18 kHz; to ground, 4.5 V and 1.79 kHz', () => {
    const up = pushed('+'), down = pushed('ground');
    const ctrl = (circuit: Circuit) => {
      const timer = toneTimer(circuit);
      return new Work(circuit).bench({ watch: [[timer, NE555.CTRL]] }).volts(timer.id, timer.pins[NE555.CTRL].id).mean;
    };
    expect(ctrl(up).toFixed(2)).toBe('6.75');
    expect(ctrl(down).toFixed(2)).toBe('4.50');
    expect(formatHertz(outHertz(up, toneTimer(up))!)).toBe('1.18 kHz');
    expect(formatHertz(outHertz(down, toneTimer(down))!)).toBe('1.79 kHz');
    const experiment = tryOut('push');
    expect(experiment.made(new Work(up))).toBe(true);
    const result = experiment.result(new Work(up));
    expect(result).toMatch(/^1\.18 kHz, down from 1\.38 kHz\. CTRL now sits at 6\.75 V, not 6 V/);
    expect(result).toContain('pulled down to 4.5 V: 1.79 kHz');
    // It is found with the switch open too: it is the change that counts
    expect(experiment.made(new Work(param(up, only(up, 'switch'), { closed: 0 })))).toBe(true);
    expect(experiment.made(new Work(down))).toBe(false);
    expect(experiment.made(new Work(siren()))).toBe(false);
    // A resistor from + to nowhere is not a push
    const loose = resistor(10e3, 900, 600), base = siren();
    expect(experiment.made(new Work(wire(base.addComponent(loose), loose, 0, only(base, 'power'), 0)))).toBe(false);
  });

  it('4.7 kΩ into CTRL takes the siren to 1.05 and 2.03 kHz, 47 kΩ to 1.33 and 1.49 kHz', () => {
    const base = siren();
    const wide = ohms(base, pushOf(base), 4.7e3), narrow = ohms(base, pushOf(base), 47e3);
    const widePitches = sirenPitches(wide), narrowPitches = sirenPitches(narrow);
    expect(formatHertz(widePitches.whileHigh)).toBe('1.05 kHz');
    expect(formatHertz(widePitches.whileLow)).toBe('2.03 kHz');
    expect(formatHertz(narrowPitches.whileHigh)).toBe('1.33 kHz');
    expect(formatHertz(narrowPitches.whileLow)).toBe('1.49 kHz');
    const experiment = tryOut('say');
    expect(experiment.made(new Work(wide))).toBe(true);
    expect(experiment.result(new Work(wide))).toMatch(/^1\.05 kHz and 2\.03 kHz, where 10 kΩ gave 1\.18 kHz and 1\.78 kHz\. .* Try 47 kΩ: 1\.33 kHz and 1\.49 kHz/);
    expect(experiment.made(new Work(base))).toBe(false);
    expect(experiment.made(new Work(narrow))).toBe(false);
    // With the switch open, too
    expect(experiment.made(new Work(param(wide, only(wide, 'switch'), { closed: 0 })))).toBe(true);
    // A 4.7 kΩ somewhere else is not the change: here, for the tone's first resistor
    expect(experiment.made(new Work(ohms(base, resistorOn(base, toneTimer(base), NE555.DISCH, 10e3), 4.7e3)))).toBe(false);
  });

  it('with its RESET on ground the tone stops, its output low', () => {
    const circuit = resetGrounded();
    const timer = toneTimer(circuit);
    const run = new Work(circuit).bench({ seconds: 0.5, sampleRate: 8000, watch: [[timer, NE555.OUT]] });
    expect(run.volts(timer.id, timer.pins[NE555.OUT].id).max).toBeLessThan(0.01);
    expect(Math.max(...run.soundTrace.map(Math.abs))).toBe(0);
    const experiment = tryOut('reset');
    expect(experiment.made(new Work(circuit))).toBe(true);
    expect(experiment.result(new Work(circuit))).toMatch(/^Silence\. With RESET low, OUT is held low/);
    expect(experiment.made(new Work(siren()))).toBe(false);
    // RESET merely taken off + is not it: the tone carries on
    const base = siren();
    expect(experiment.made(new Work(unwire(base, toneTimer(base), NE555.RESET)))).toBe(false);
    // Nor is the one-shot's RESET on ground: the tone carries on
    expect(experiment.made(new Work(resetGrounded(base, shotTimer(base))))).toBe(false);
  });

  it('every experiment asks a question with a right answer, and is not found on an empty canvas or in the circuit as built', () => {
    const loose = [place('power', 0, 0, { parameters: { voltage: 5 } }), place('ne555', 200, 0), place('audio-output', 400, 0), resistor(4700, 0, 200), resistor(47e3, 200, 200)]
      .reduce((circuit, part) => circuit.addComponent(part), new Circuit('loose'));
    for (const experiment of lesson.tries) {
      expect(experiment.options.length).toBeGreaterThan(1);
      expect(experiment.options.length).toBeLessThanOrEqual(4);
      expect(experiment.options[experiment.answer]).toBeDefined();
      expect(experiment.made(new Work(new Circuit('empty')))).toBe(false);
      expect(experiment.made(new Work(siren()))).toBe(false);
      expect(experiment.made(new Work(loose))).toBe(false);
    }
  });
});

describe('class 9, the 555: the check', () => {
  it('is not passed by the circuit as built: it sounds without being asked', () => {
    const work = new Work(siren());
    expect(lesson.check.passed(work)).toBe(false);
    expect(lesson.check.reading(work)).toMatch(/^Your bell: 1\.1\d kHz and 1\.7\d kHz, sounding before the button is touched$/);
    const base = siren();
    const open = new Work(param(base, only(base, 'switch'), { closed: 0 }));
    expect(lesson.check.reading(open)).toBe('Your bell: 1.38 kHz, sounding before the button is touched');
    expect(lesson.check.passed(open)).toBe(false);
  });

  it('is passed the way the hint gives: RESET on the one-shot\'s output and 100 kΩ, for 685 Hz and 1.10 s', () => {
    const circuit = bell();
    // Counted on the tone's output at 48 kHz: silent, then the tone from the tap until 1.10 s later, then silent
    const result = tap(circuit);
    expect(result.rises[0]).toBeCloseTo(0.1, 3);
    expect((result.lastHigh - result.rises[0]).toFixed(2)).toBe('1.10');
    const ringing = result.rises.slice(10);
    // 685.5 Hz: the app's meter may show it as 685 or as 686
    const hertz = (ringing.length - 1) / (ringing[ringing.length - 1] - ringing[0]);
    expect(hertz).toBeGreaterThan(685);
    expect(hertz).toBeLessThan(686);
    const before = result.run.soundTrace.slice(0, Math.floor(0.1 * 48000));
    expect(Math.max(...before.map(Math.abs))).toBe(0);
    const after = result.run.soundTrace.slice(Math.floor(1.4 * 48000));
    expect(Math.max(...after.map(Math.abs))).toBeLessThan(0.01);

    expect(lesson.check.reading(new Work(circuit))).toBe('Your bell: silent, then 685 Hz for 1.10 s after a tap');
    expect(lesson.check.passed(new Work(circuit))).toBe(true);
    // The hint's sum, which it says is calculated
    expect(Math.round(1.44 / ((10e3 + 2 * 100e3) * 10e-9))).toBe(686);
    expect(lesson.check.hint).toMatch(/^Calculated, not measured/);
    expect(lesson.check.hint).toContain('1.44 ÷ ((10 kΩ + 2 × 100 kΩ) × 10 nF) = 686 Hz');
    expect(lesson.check.hint).toContain('high for 1.1 s after a tap');
    for (const quoted of ['between 600 and 800 Hz', 'from 0.9 to 1.2 s']) expect(lesson.check.goal).toContain(quoted);
  });

  it('is passed whether the button is held or not when it is measured, and by other values that do the same', () => {
    const circuit = bell();
    const pressed = param(circuit, only(circuit, 'pushbutton'), { closed: 1 });
    expect(lesson.check.passed(new Work(pressed))).toBe(true);
    // 22 nF with the 47 kΩ left in: 630 Hz
    let other = bell({ rb: 47e3 });
    other = farads(other, all(other, 'capacitor').find((c) => Number(c.parameters.capacitance) === 10e-9)!, 22e-9);
    expect(lesson.check.reading(new Work(other))).toMatch(/^Your bell: silent, then 6[23]\d Hz for 1\.10 s after a tap$/);
    expect(lesson.check.passed(new Work(other))).toBe(true);
    // With the siren taken away altogether
    const plain = circuit.removeComponent(only(circuit, 'cd40106').id);
    expect(lesson.check.passed(new Work(plain))).toBe(true);
  });

  it('is not passed while the bell wails, and says what it hears', () => {
    const circuit = bell({ open: false });
    expect(lesson.check.reading(new Work(circuit))).toMatch(/^Your bell: silent, then 5\d\d Hz and 8\d\d Hz for 1\.10 s after a tap$/);
    expect(lesson.check.passed(new Work(circuit))).toBe(false);
  });

  it('is not passed by the wrong pitch, by too short a ring or by too long a one', () => {
    const high = bell({ rb: 47e3 });
    expect(lesson.check.reading(new Work(high))).toBe('Your bell: silent, then 1.38 kHz for 1.10 s after a tap');
    expect(lesson.check.passed(new Work(high))).toBe(false);
    const short = shortShot(bell());
    expect(lesson.check.reading(new Work(short))).toBe('Your bell: silent, then 685 Hz for 0.52 s after a tap');
    expect(lesson.check.passed(new Work(short))).toBe(false);
    const base = bell();
    const wait = resistorOn(base, shotTimer(base), NE555.DISCH);
    const long = ohms(base, wait, 220e3);
    expect(lesson.check.reading(new Work(long))).toBe('Your bell: silent, then 685 Hz and still sounding after 1.5 s after a tap');
    expect(lesson.check.passed(new Work(long))).toBe(false);
    // The limits themselves: 82 kΩ rings for 0.90 s and passes, 120 kΩ for 1.32 s and does not
    const least = ohms(base, wait, 82e3);
    expect(lesson.check.reading(new Work(least))).toBe('Your bell: silent, then 685 Hz for 0.90 s after a tap');
    expect(lesson.check.passed(new Work(least))).toBe(true);
    const more = ohms(base, wait, 120e3);
    expect(lesson.check.reading(new Work(more))).toBe('Your bell: silent, then 685 Hz for 1.32 s after a tap');
    expect(lesson.check.passed(new Work(more))).toBe(false);
  });

  it('says so when nothing sounds, and has nothing to read before there is a 555 and something to hear it by', () => {
    const silent = resetGrounded();
    expect(lesson.check.reading(new Work(silent))).toBe('Your bell: silent, even after a tap');
    expect(lesson.check.passed(new Work(silent))).toBe(false);
    expect(lesson.check.reading(new Work(new Circuit('empty')))).toBeNull();
    expect(lesson.check.passed(new Work(new Circuit('empty')))).toBe(false);
    expect(lesson.check.reading(new Work(blinker()))).toBeNull();
    expect(lesson.check.passed(new Work(blinker()))).toBe(false);
  });
});

describe('class 9, the 555: the steps', () => {
  it('none are done on an empty canvas, or by parts that are only lying on it', () => {
    expect(done(new Work(new Circuit('empty')))).toEqual([]);
    expect(done(new Work(new Circuit('empty'), playing))).toEqual(['play']);
    expect(lesson.keep.filter((s) => s.done(new Work(new Circuit('empty')))).map((s) => s.id)).toEqual([]);
    const loose = [place('power', 0, 0), ground(0, 100), place('ne555', 200, 0), place('ne555', 400, 0), resistor(10e3, 0, 200), resistor(100e3, 100, 200),
      capacitor(4.7e-6, 200, 200), place('led', 300, 200), place('audio-output', 400, 200), place('pushbutton', 500, 200), place('cd40106', 600, 0), place('switch', 600, 200)]
      .reduce((circuit, part) => circuit.addComponent(part), new Circuit('loose'));
    expect(done(new Work(loose))).toEqual([]);
    expect(lesson.keep.filter((s) => s.done(new Work(loose))).map((s) => s.id)).toEqual([]);
    expect(lesson.check.passed(new Work(loose))).toBe(false);
  });

  it('the blinker: the chip is powered, then it ticks, then it blinks', () => {
    // A supply, a ground and a 555 with its three pins wired
    const supply = place('power', 100, 260), gnd = ground(100, 360), timer = place('ne555', 440, 280);
    let circuit = [supply, gnd, timer].reduce((c, part) => c.addComponent(part), new Circuit('mine'));
    expect(done(new Work(circuit))).toEqual([]);
    circuit = wire(wire(wire(circuit, supply, 1, gnd, 0), supply, 0, timer, NE555.VCC), timer, NE555.GND, gnd, 0);
    expect(done(new Work(circuit))).toEqual([]); // RESET is not on + yet
    circuit = wire(circuit, timer, NE555.RESET, supply, 0);
    expect(done(new Work(circuit))).toEqual(['chip']);

    const whole = blinker();
    // Without the wire from THRES to TRIG nothing watches the capacitor fall, and it does not go round
    const work = new Work(whole), blinkTimer = toneTimer(whole);
    const link = whole.getConnections().find((c) => [c.from.pinId, c.to.pinId].includes(blinkTimer.pins[NE555.TRIG].id)
      && [c.from.pinId, c.to.pinId].includes(blinkTimer.pins[NE555.THRES].id) && c.from.componentId === c.to.componentId)!;
    expect(link).toBeDefined();
    expect(work.joined(blinkTimer, NE555.THRES, blinkTimer, NE555.TRIG)).toBe(true);
    const capWire = whole.getConnections().find((c) => c.from.componentId === only(whole, 'capacitor').id && c.to.componentId === blinkTimer.id)!;
    const unlinked = whole.removeConnection(link.id).removeConnection(capWire.id)
      .addConnection(connect(only(whole, 'capacitor'), 0, blinkTimer, NE555.THRES));
    expect(done(new Work(unlinked))).toEqual(['chip']);
    // With no LED yet it ticks all the same
    const noLed = whole.removeComponent(only(whole, 'led').id);
    expect(done(new Work(noLed))).toEqual(['chip', 'timing']);
    expect(done(new Work(whole))).toEqual(['chip', 'timing', 'led']);
    expect(done(new Work(whole, playing))).toEqual(['chip', 'timing', 'led', 'play']);
    // An LED straight across the supply is lit, but it does not blink
    expect(step(lesson.build, 'led').done(new Work(wire(noLed, resistorOn(noLed, blinkTimer, NE555.OUT), 1, only(noLed, 'power'), 0)))).toBe(false);
  });

  it('the probe goes on the capacitor, with the circuit playing', () => {
    const circuit = blinker();
    const timer = toneTimer(circuit), cap = only(circuit, 'capacitor');
    const on = (part: Component, pin: number): Situation => ({ ...playing, probes: [{ componentId: part.id, pinId: part.pins[pin].id }] });
    expect(step(lesson.build, 'probe').done(new Work(circuit, on(cap, 0)))).toBe(true);
    expect(step(lesson.build, 'probe').done(new Work(circuit, on(timer, NE555.TRIG)))).toBe(true);
    expect(step(lesson.build, 'probe').done(new Work(circuit, on(timer, NE555.OUT)))).toBe(false);
    expect(step(lesson.build, 'probe').done(new Work(circuit, { ...on(cap, 0), playing: false }))).toBe(false);
    expect(step(lesson.build, 'probe').done(new Work(circuit, playing))).toBe(false);
  });

  it('the tone: the values are changed, then it is heard', () => {
    let circuit = blinker();
    circuit = ohms(circuit, rbOf(circuit), 47e3);
    expect(step(lesson.build, 'faster').done(new Work(circuit))).toBe(false); // 31 Hz: only one of the two is changed
    circuit = farads(circuit, only(circuit, 'capacitor'), 10e-9);
    expect(step(lesson.build, 'faster').done(new Work(circuit))).toBe(true);
    expect(step(lesson.build, 'listen').done(new Work(circuit))).toBe(false);
    // An Audio Out beside the LED will do: the LED need not go
    const jack = place('audio-output', 580, 400);
    expect(step(lesson.build, 'listen').done(new Work(wire(circuit.addComponent(jack), toneTimer(circuit), NE555.OUT, jack, 0)))).toBe(true);
    // An Audio Out on the canvas with nothing wired to it hears nothing
    expect(step(lesson.build, 'listen').done(new Work(circuit.addComponent(jack)))).toBe(false);
    expect(done(new Work(tone()))).toEqual(['chip', 'timing', 'led', 'faster', 'listen']);
    // Some other pitch is not this tone
    const built = tone();
    expect(step(lesson.build, 'listen').done(new Work(ohms(built, rbOf(built), 100e3)))).toBe(false);
  });

  it('the one-shot: a second 555 set up to wait, its button, then its light', () => {
    const base = tone();
    const supply = only(base, 'power'), gnd = all(base, 'ground')[0];
    const shot = place('ne555', 880, 280), r = resistor(100e3, 760, 170, 90), c = capacitor(10e-6, 760, 330, 90);
    const pullUp = resistor(10e3, 680, 500), button = place('pushbutton', 800, 580), limit = resistor(1000, 1020, 270), led = place('led', 1120, 350);
    let circuit = [shot, r, c, pullUp, button, limit, led].reduce((result, part) => result.addComponent(part), base);
    const now = () => done(new Work(circuit)).filter((id) => !['chip', 'timing', 'led', 'faster', 'listen'].includes(id));
    expect(now()).toEqual([]);
    // Every two-legged part the other way round from the class's own circuit
    circuit = wire(wire(wire(circuit, shot, NE555.VCC, supply, 0), shot, NE555.GND, gnd, 0), shot, NE555.RESET, supply, 0);
    circuit = wire(wire(wire(circuit, r, 1, supply, 0), r, 0, shot, NE555.THRES), shot, NE555.THRES, shot, NE555.DISCH);
    expect(now()).toEqual([]); // no capacitor yet
    circuit = wire(wire(circuit, c, 1, shot, NE555.DISCH), c, 0, gnd, 0);
    expect(now()).toEqual(['second']);
    circuit = wire(wire(circuit, pullUp, 1, supply, 0), pullUp, 0, shot, NE555.TRIG);
    expect(now()).toEqual(['second']); // no button yet
    circuit = wire(wire(circuit, button, 1, shot, NE555.TRIG), button, 0, gnd, 0);
    expect(now()).toEqual(['second', 'button']);
    circuit = wire(wire(wire(circuit, shot, NE555.OUT, limit, 1), limit, 0, led, 0), led, 1, gnd, 0);
    expect(now()).toEqual(['second', 'button', 'lamp']);
    expect(tap(circuit).lit.toFixed(2)).toBe('1.10');
    expect(done(new Work(withShot()))).toEqual(['chip', 'timing', 'led', 'faster', 'listen', 'second', 'button', 'lamp']);
  });

  it('a button and an LED with no 555 between them are not a one-shot: the light goes out with the button', () => {
    const base = tone();
    const button = place('pushbutton', 800, 400), limit = resistor(1000, 900, 400), led = place('led', 1000, 400);
    let circuit = [button, limit, led].reduce((result, part) => result.addComponent(part), base);
    circuit = wire(wire(wire(wire(circuit, only(base, 'power'), 0, button, 0), button, 1, limit, 0), limit, 1, led, 0), led, 1, all(base, 'ground')[0], 0);
    expect(tap(circuit).lit).toBeCloseTo(0.1, 2);
    expect(step(lesson.build, 'lamp').done(new Work(circuit))).toBe(false);
  });

  it('the siren: the slow oscillator, its way into CTRL, then the switch', () => {
    const base = withShot();
    const supply = only(base, 'power'), gnd = all(base, 'ground')[0], timer = toneTimer(base);
    // On the third inverter, and every two-legged part the other way round
    const chip = place('cd40106', 240, 700), feedback = resistor(1e6, 240, 840), slowCap = capacitor(1e-6, 120, 720, 90), push = resistor(10e3, 400, 650);
    let circuit = [chip, feedback, slowCap, push].reduce((result, part) => result.addComponent(part), base);
    const now = () => done(new Work(circuit)).filter((id) => ['slow', 'ctrl', 'wail'].includes(id));
    circuit = wire(wire(circuit, chip, CD40106.VDD, supply, 0), chip, CD40106.VSS, gnd, 0);
    circuit = wire(wire(circuit, feedback, 0, chip, CD40106.Y[2]), feedback, 1, chip, CD40106.A[2]);
    expect(now()).toEqual([]); // no capacitor yet
    circuit = wire(wire(circuit, slowCap, 1, chip, CD40106.A[2]), slowCap, 0, gnd, 0);
    expect(now()).toEqual(['slow']);
    const direct = wire(wire(circuit, push, 1, chip, CD40106.Y[2]), push, 0, timer, NE555.CTRL);
    expect(done(new Work(direct)).filter((id) => ['slow', 'ctrl', 'wail'].includes(id))).toEqual(['slow', 'ctrl']);
    // The switch on the other side of the resistor does as well
    const toggle = place('switch', 520, 650, { parameters: { closed: 0 } });
    circuit = wire(wire(wire(circuit.addComponent(toggle), toggle, 1, chip, CD40106.Y[2]), toggle, 0, push, 1), push, 0, timer, NE555.CTRL);
    expect(now()).toEqual(['slow', 'ctrl', 'wail']);
    // A switch somewhere it does nothing is not the one
    expect(step(lesson.build, 'wail').done(new Work(direct.addComponent(toggle)))).toBe(false);
    expect(done(new Work(siren()))).toEqual(['chip', 'timing', 'second', 'button', 'lamp', 'slow', 'ctrl', 'wail']);
  });

  it('"Stuck?" gives the circuit for the part of the build being worked on', () => {
    expect(lesson.stages!.map((s) => s.upTo)).toEqual(['probe', 'listen', 'lamp']);
    const types = (circuit: Circuit, type: string) => all(circuit, type).length;
    expect([types(blinker(), 'ne555'), types(blinker(), 'led'), types(blinker(), 'audio-output')]).toEqual([1, 1, 0]);
    expect([types(tone(), 'ne555'), types(tone(), 'led'), types(tone(), 'audio-output')]).toEqual([1, 0, 1]);
    expect([types(withShot(), 'ne555'), types(withShot(), 'led'), types(withShot(), 'pushbutton'), types(withShot(), 'cd40106')]).toEqual([2, 1, 1, 0]);
    expect([types(siren(), 'ne555'), types(siren(), 'cd40106'), types(siren(), 'switch')]).toEqual([2, 1, 1]);
    expect(classStage(lesson, upTo('button')).getComponents()).toHaveLength(withShot().getComponents().length);
    expect(classStage(lesson, upTo('lamp')).getComponents()).toHaveLength(siren().getComponents().length);
    expect(classStage(lesson, ids).getComponents()).toHaveLength(siren().getComponents().length);
  });

  it('the circuits are laid out with room between the parts', () => {
    for (const circuit of [blinker(), tone(), withShot(), siren(), kept()]) {
      const parts = circuit.getComponents().filter((c) => c.type !== 'ground');
      for (const a of parts) {
        for (const b of parts) {
          if (a.id !== b.id) expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThanOrEqual(100);
        }
        expect(a.position.x % 20).toBe(0);
        expect(a.position.y % 20).toBe(0);
      }
    }
  });

  it('keeping it: the button named RING, the switch named WAIL, a look at the cover, a save, and the Atari Punk Console', () => {
    const circuit = bell({ open: false });
    expect(lesson.keep.map((s) => s.id)).toEqual(['ring', 'name', 'cover', 'save', 'punk']);
    expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual([]);
    const rung = circuit.updateComponent(only(circuit, 'pushbutton').id, { label: 'ring' });
    expect(step(lesson.keep, 'ring').done(new Work(rung))).toBe(true);
    const named = rung.updateComponent(only(rung, 'switch').id, { label: 'Wail' });
    expect(step(lesson.keep, 'name').done(new Work(named))).toBe(true);
    expect(step(lesson.keep, 'name').done(new Work(rung))).toBe(false);
    expect(step(lesson.keep, 'cover').done(new Work(named, { ...playing, view: 'cover' }))).toBe(true);
    expect(step(lesson.keep, 'cover').done(new Work(named, playing))).toBe(false);
    expect(step(lesson.keep, 'save').done(new Work(named, { ...playing, saved: true }))).toBe(true);
    expect(step(lesson.keep, 'save').done(new Work(new Circuit('empty'), { ...playing, saved: true }))).toBe(false);
  });

  it('what it keeps is the doorbell that wails: RING sets it off for 1.10 s, WAIL chooses between 685 Hz and a siren', () => {
    const circuit = kept();
    expect(lesson.keep.filter((s) => s.done(new Work(circuit))).map((s) => s.id)).toEqual(['ring', 'name']);
    expect(only(circuit, 'pushbutton').label).toBe('RING');
    expect(only(circuit, 'switch').label).toBe('WAIL');
    // It is the hint's doorbell with the switch closed, part for part
    expect(circuit.getComponents().map((c) => c.type).sort()).toEqual(bell().getComponents().map((c) => c.type).sort());

    // RING: silent until it is tapped, and for good if it never is
    const untouched = new Work(circuit).bench({ seconds: 1, sampleRate: 8000 });
    expect(Math.max(...untouched.soundTrace.map(Math.abs))).toBe(0);
    const rung = tap(circuit);
    expect(rung.rises[0]).toBeCloseTo(0.1, 3);
    expect((rung.lastHigh - rung.rises[0]).toFixed(2)).toBe('1.10');
    expect(rung.lit.toFixed(2)).toBe('1.10');

    // WAIL closed, as it is kept: two notes. The button is held so that it sounds for long enough to count them
    const closed = sirenPitches(circuit, held(circuit));
    expect(closed.whileLow / closed.whileHigh).toBeGreaterThan(1.4);
    expect(closed.whileHigh).toBeGreaterThan(570);
    expect(closed.whileHigh).toBeLessThan(600);
    expect(closed.whileLow).toBeGreaterThan(850);
    expect(closed.whileLow).toBeLessThan(890);
    expect(lesson.check.passed(new Work(circuit))).toBe(false);
    // WAIL open: one, and it is the doorbell of the check
    const open = param(circuit, only(circuit, 'switch'), { closed: 0 });
    const hertz = outHertz(open, toneTimer(open), held(open))!;
    expect(hertz).toBeGreaterThan(685);
    expect(hertz).toBeLessThan(686);
    expect(lesson.check.reading(new Work(open))).toBe('Your bell: silent, then 685 Hz for 1.10 s after a tap');
    expect(lesson.check.passed(new Work(open))).toBe(true);
  });

  it('reading a learner\'s circuit is quick enough to do at every edit', () => {
    // Every step, experiment and the check, on each circuit of the build, from nothing: about a third of a second for the lot here
    const started = performance.now();
    for (const circuit of [blinker(), tone(), withShot(), siren(), bell()]) {
      const work = new Work(circuit);
      for (const s of [...lesson.build, ...lesson.keep]) s.done(work);
      for (const experiment of lesson.tries) experiment.made(work);
      lesson.check.passed(work);
      lesson.check.reading(work);
    }
    expect(performance.now() - started).toBeLessThan(3000);
  });
});
