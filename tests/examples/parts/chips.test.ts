/**
 * The examples of the chips, each held to what its words say: the 555, the
 * logic chips and the amplifiers.
 */
import { describe, expect, it } from 'vitest';
import { CD40106, CD4013, CD4017, CD4040, DARK, LIT, reading } from '@/classes/kit';
import { OP_AMP_VOLTS, PREAMP_LEVEL } from '@/examples/parts/chips';
import { exampleOf, made, withParts } from './helpers';

withParts();

const swing = (r: { min: number; max: number }) => r.max - r.min;
const held = (id: string) => [{ componentId: id, parameter: 'closed', value: 1 }];

describe('the 555', () => {
  it('blinks its LED a little over once a second, and ON switches it all off', () => {
    const { work, one, featured } = made(exampleOf('ne555').example.build());
    expect(featured).toBe(one('ne555'));
    const on = one('switch');
    expect(on.label).toBe('ON');
    expect(on.parameters.closed).toBe(1);
    const led = one('led');
    const run = work.bench({ seconds: 4, sampleRate: 2000, watch: [[featured, 5]], watchAmps: [led.id] });
    const hertz = reading(run, featured, 5).hertz!;
    expect(hertz).toBeGreaterThan(1);
    expect(hertz).toBeLessThan(2);
    const amps = run.ampsTrace(led.id)!;
    expect(Math.max(...amps)).toBeGreaterThan(LIT * 10);
    expect(Math.min(...amps)).toBeLessThan(DARK);
    expect(work.run([{ componentId: on.id, parameter: 'closed', value: 0 }]).amps(led.id)).toBeLessThan(DARK);
  });

  it('a smaller capacitor blinks faster, and a small enough one makes a note', () => {
    const { circuit, one } = made(exampleOf('ne555').example.build());
    const tank = one('capacitor'), timer = one('ne555');
    const at = (farads: number, seconds: number) => {
      const smaller = circuit.updateComponent(tank.id, { parameters: { ...tank.parameters, capacitance: farads } });
      const { work } = made({ components: smaller.getComponents(), connections: smaller.getConnections(), featured: timer });
      return reading(work.bench({ seconds, sampleRate: farads < 1e-7 ? 48000 : 4000, watch: [[timer, 5]] }), timer, 5).hertz!;
    };
    expect(at(1e-6, 2)).toBeGreaterThan(at(4.7e-6, 4));
    expect(at(10e-9, 0.1)).toBeGreaterThan(100);
  });
});

describe('the logic chips', () => {
  it('CD4093: silent until PRESS is held, then a note; let go and it stops', () => {
    const { work, one, featured } = made(exampleOf('cd4093').example.build());
    expect(featured).toBe(one('cd4093'));
    const out = one('audio-output'), button = one('pushbutton');
    expect(button.label).toBe('PRESS');
    expect(reading(work.bench({ seconds: 0.1, watch: [[out, 0]] }), out, 0).hertz).toBeNull();
    const note = reading(work.bench({ seconds: 0.1, watch: [[out, 0]], set: held(button.id) }), out, 0);
    expect(note.hertz).toBeGreaterThan(200);
    expect(note.hertz).toBeLessThan(5000);
    expect(swing(note)).toBeGreaterThan(8.5);
  });

  it('CD4040: Q1, Q2 and Q3 each blink at half the speed of the one before, and ZERO puts them all out', () => {
    const { work, one, featured } = made(exampleOf('cd4040').example.build());
    expect(featured).toBe(one('cd4040'));
    const clock = one('cd40106');
    const run = work.bench({ seconds: 6, sampleRate: 2000, watch: [[clock, CD40106.Y[0]], ...[0, 1, 2].map((q) => [featured, CD4040.Q[q]] as const)] });
    const tick = reading(run, clock, CD40106.Y[0]).hertz!;
    // Watchable: a few ticks a second
    expect(tick).toBeGreaterThan(1);
    expect(tick).toBeLessThan(5);
    [0, 1, 2].forEach((q) => expect(reading(run, featured, CD4040.Q[q]).hertz!).toBeCloseTo(tick / 2 ** (q + 1), 1));
    // Each output lights its LED
    expect(work.parts('led')).toHaveLength(3);
    const zero = work.bench({ seconds: 2, sampleRate: 2000, set: held(one('pushbutton').id), watch: [0, 1, 2].map((q) => [featured, CD4040.Q[q]] as const) });
    [0, 1, 2].forEach((q) => expect(reading(zero, featured, CD4040.Q[q]).max).toBeLessThan(0.1));
    expect(one('pushbutton').label).toBe('ZERO');
  });

  it('CD4017: four lights, one at a time, round and round; HOLD stops them', () => {
    const { work, one, featured } = made(exampleOf('cd4017').example.build());
    expect(featured).toBe(one('cd4017'));
    const clock = one('cd40106');
    const outs = [0, 1, 2, 3].map((q) => [featured, CD4017.Q[q]] as const);
    const run = work.bench({ seconds: 6, sampleRate: 2000, watch: [[clock, CD40106.Y[0]], ...outs] });
    const tick = reading(run, clock, CD40106.Y[0]).hertz!;
    for (const [, pin] of outs) expect(reading(run, featured, pin).hertz!).toBeCloseTo(tick / 4, 1);
    // One at a time: at every moment exactly one of the four is high
    const traces = outs.map(([part, pin]) => run.trace(part.id, part.pins[pin].id)!);
    for (let i = 0; i < traces[0].length; i += 50) expect(traces.filter((t) => t[i] > 4.5).length).toBe(1);
    const hold = work.bench({ seconds: 3, sampleRate: 2000, set: held(one('pushbutton').id), watch: outs.map(([p, pin]) => [p, pin] as const) });
    for (const [, pin] of outs) expect(reading(hold, featured, pin).hertz).toBeNull();
    expect(one('pushbutton').label).toBe('HOLD');
  });

  it('CD4049: settles half way; a small tone comes out several times bigger, and turned up it is rounded off', () => {
    const { work, one, featured } = made(exampleOf('cd4049').example.build());
    expect(featured).toBe(one('cd4049'));
    const input = one('audio-input'), out = one('audio-output');
    expect(input.label).toBe('LEVEL');
    expect(input.parameters.level).toBe(PREAMP_LEVEL);
    const at = (level: number) => {
      const run = work.bench({ seconds: 0.3, watch: [[input, 0], [featured, 6], [out, 0]], set: [{ componentId: input.id, parameter: 'level', value: level }] });
      return { gain: swing(reading(run, out, 0)) / swing(reading(run, input, 0)), output: reading(run, featured, 6) };
    };
    const small = at(PREAMP_LEVEL), big = at(1);
    expect(small.output.mean).toBeCloseTo(4.5, 1);
    expect(small.gain).toBeGreaterThan(4);
    // Rounded off: turned up ten times, it comes out nothing like ten times bigger, and never reaches the rails
    expect(big.gain).toBeLessThan(small.gain * 0.6);
    expect(big.output.min).toBeGreaterThan(0.5);
    expect(big.output.max).toBeLessThan(8.5);
  });

  it('CD4013: each press turns the LED over, and it stays as it was left in between', () => {
    const { work, one, featured } = made(exampleOf('cd4013').example.build());
    expect(featured).toBe(one('cd4013'));
    const button = one('pushbutton'), led = one('led');
    const events = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6].map((at, i) => ({ at, componentId: button.id, parameter: 'closed', value: i % 2 ? 0 : 1 }));
    const run = work.bench({ seconds: 0.7, sampleRate: 2000, watchAmps: [led.id], events });
    const amps = run.ampsTrace(led.id)!;
    const lit = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65].map((s) => amps[Math.round(s * run.sampleRate)] > LIT);
    expect(lit).toEqual([false, true, true, false, false, true, true]);
    expect(work.joined(featured, CD4013.NOT_Q[0], featured, CD4013.D[0])).toBe(true);
  });
});

describe('the amplifiers', () => {
  for (const type of ['lm741', 'tl072']) {
    it(`${type}: eleven times what goes in comes out, on a rail above ground and one below`, () => {
      const { work, one, featured } = made(exampleOf(type).example.build());
      expect(featured).toBe(one(type));
      const input = one('audio-input'), out = one('audio-output');
      expect(input.parameters.volts).toBe(OP_AMP_VOLTS);
      const run = work.bench({ seconds: 0.1, watch: [[input, 0], [out, 0]] });
      expect(swing(reading(run, out, 0)) / swing(reading(run, input, 0))).toBeCloseTo(11, 1);
      expect(reading(run, out, 0).mean).toBeCloseTo(0, 1);
      expect(reading(run, out, 0).min).toBeLessThan(-1);
      // LEVEL turns down what goes in, and so what comes out
      const less = work.bench({ seconds: 0.1, watch: [[out, 0]], set: [{ componentId: input.id, parameter: 'level', value: 0.5 }] });
      expect(swing(reading(less, out, 0)) / swing(reading(run, out, 0))).toBeCloseTo(0.5, 2);
    });
  }

  it('LM324: KNOB starts low and the LED dark; past half way it lights, and back it goes out', () => {
    const { work, one, featured } = made(exampleOf('lm324').example.build());
    expect(featured).toBe(one('lm324'));
    const knob = one('potentiometer'), led = one('led');
    expect(knob.label).toBe('KNOB');
    const lit = (position: number) => work.run([{ componentId: knob.id, parameter: 'position', value: position }]).amps(led.id) > LIT;
    expect(lit(Number(knob.parameters.position))).toBe(false);
    expect([0, 0.25, 0.45, 0.55, 0.75, 1].map(lit)).toEqual([false, false, false, true, true, true]);
    expect(work.parts('resistor').filter((r) => r.parameters.resistance === 10e3)).toHaveLength(2);
  });

  it('LM13700: the tone is quieter as LOUDNESS turns down, and gone at the bottom', () => {
    const { work, one, featured } = made(exampleOf('lm13700').example.build());
    expect(featured).toBe(one('lm13700'));
    const knob = one('potentiometer'), out = one('audio-output');
    expect(knob.label).toBe('LOUDNESS');
    expect(knob.parameters.position).toBe(1);
    const level = (position: number) => swing(reading(work.bench({ seconds: 0.1, watch: [[out, 0]], set: [{ componentId: knob.id, parameter: 'position', value: position }] }), out, 0));
    let last = Infinity;
    for (const position of [1, 0.75, 0.5, 0.25]) {
      const now = level(position);
      expect(now, `${position}`).toBeLessThan(last);
      expect(now, `${position}`).toBeGreaterThan(0.2);
      last = now;
    }
    expect(level(0)).toBeLessThan(0.001);
  });
});
