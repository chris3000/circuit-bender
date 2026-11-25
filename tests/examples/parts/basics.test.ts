/**
 * The examples of the first parts, each held to what its words say: the
 * light and what closes its loop, the resistor, the capacitor by size, the
 * pot and the oscillator.
 */
import { describe, expect, it } from 'vitest';
import { CD40106, LIT, DARK, ledAmps, reading } from '@/classes/kit';
import { Work } from '@/classes/Work';
import { DIMMER_FAINT, DIMMER_HOT } from '@/examples/parts/basics';
import { ledBrightness } from '@/utils/ledLight';
import { definition, exampleById, exampleOf, made, withParts, without } from './helpers';

withParts();

const stock = (type: string) => definition(type).shelf!.stock!;
/** The stocked values an example is for. */
const valuesOf = (id: string) => stock(exampleById(id).part).filter((value) => exampleOf(exampleById(id).part, value).example.id === id);

describe('the light', () => {
  it('LED and switch: lit with the switch closed, dark with it open, and it starts open', () => {
    for (const type of ['led', 'switch']) {
      const { work, one, featured } = made(exampleOf(type).example.build());
      const toggle = one('switch');
      expect(featured).toBe(type === 'led' ? one('led') : toggle);
      expect(toggle.parameters.closed).toBe(0);
      expect(ledAmps(work, work.run([{ componentId: toggle.id, parameter: 'closed', value: 1 }]))).toBeGreaterThan(LIT);
      expect(ledAmps(work, work.run())).toBeLessThan(DARK);
    }
  });

  it('push button: lit only while held', () => {
    const { work, one, featured } = made(exampleOf('pushbutton').example.build());
    const button = one('pushbutton');
    expect(featured).toBe(button);
    const run = work.bench({
      seconds: 0.3, watchAmps: [one('led').id],
      events: [{ at: 0.1, componentId: button.id, parameter: 'closed', value: 1 }, { at: 0.2, componentId: button.id, parameter: 'closed', value: 0 }],
    });
    const amps = run.ampsTrace(one('led').id)!;
    const at = (seconds: number) => amps[Math.round(seconds * run.sampleRate)];
    expect(at(0.05)).toBeLessThan(DARK);
    expect(at(0.15)).toBeGreaterThan(LIT);
    expect(at(0.25)).toBeLessThan(DARK);
  });

  it('ground: the two grounds are joined by no wire, and without either the LED stays dark', () => {
    const { circuit, work, one, featured } = made(exampleOf('ground').example.build());
    expect(featured.type).toBe('ground');
    const [a, b] = work.parts('ground');
    expect(circuit.getConnections().some((w) => [w.from.componentId, w.to.componentId].includes(a.id) && [w.from.componentId, w.to.componentId].includes(b.id))).toBe(false);
    const closed = (w: Work) => ledAmps(w, w.run([{ componentId: one('switch').id, parameter: 'closed', value: 1 }]));
    expect(closed(work)).toBeGreaterThan(LIT);
    for (const gone of [a, b]) expect(closed(new Work(without(circuit, gone)))).toBeLessThan(DARK);
  });
});

describe('the resistor', () => {
  /** The current through the LED behind the resistor shown, and how hard that LED is driven, with ON closed. */
  function dimmer(ohms: number) {
    const chosen = exampleOf('resistor', ohms);
    const { work, featured, one } = made(chosen.example.build(ohms));
    const run = work.run([{ componentId: one('switch').id, parameter: 'closed', value: 1 }]);
    const leds = work.parts('led');
    const led = leds.find((l) => work.joined(l, 0, featured, 1))!;
    const other = leds.find((l) => l !== led)!;
    return { chosen, amps: run.amps(led.id), strain: run.strain(led.id), usual: run.amps(other.id), work, run };
  }

  it('dimmer: every value but 10 kΩ gets it, with the value asked about above the usual 1 kΩ', () => {
    expect(valuesOf('resistor-dimmer')).toHaveLength(stock('resistor').length - 1);
    const { chosen, amps, usual } = dimmer(4700);
    expect(chosen.description).toContain('the upper one has 4.7kΩ');
    // The usual one carries what 1 kΩ lets through, the same whatever stands beside it
    expect(usual * 1000).toBeCloseTo(6.9, 1);
    expect(dimmer(1000).amps).toBeCloseTo(usual, 6);
    expect(amps).toBeLessThan(usual);
  });

  it('dimmer: the more ohms, the less current, all the way along the shelf', () => {
    let last = Infinity;
    for (const ohms of valuesOf('resistor-dimmer')) {
      const { amps } = dimmer(ohms);
      expect(amps, `${ohms}`).toBeLessThan(last);
      last = amps;
    }
  });

  it('dimmer: says so where the LED is driven too hard, and where it barely glows, and nowhere else', () => {
    for (const ohms of valuesOf('resistor-dimmer')) {
      const { chosen, amps, strain } = dimmer(ohms);
      expect(chosen.description.includes('"!"'), `${ohms}`).toBe(strain > 1);
      expect(ohms <= DIMMER_HOT, `${ohms}`).toBe(strain > 1);
      // Barely: the faintest step or two of the twenty an LED is drawn in
      expect(chosen.description.includes('barely glows'), `${ohms}`).toBe(ledBrightness(amps) <= 0.1);
      expect(ohms >= DIMMER_FAINT, `${ohms}`).toBe(ledBrightness(amps) <= 0.1);
    }
  });

  it('pull-down: 10 kΩ only. Lit while PRESS is held; without the resistor it stays lit after', () => {
    expect(valuesOf('resistor-pull-down')).toEqual([10e3]);
    const { circuit, work, featured, one } = made(exampleOf('resistor', 10e3).example.build(10e3));
    expect(featured.parameters.resistance).toBe(10e3);
    const press = (w: Work) => {
      const button = one('pushbutton'), led = one('led');
      const run = w.bench({
        seconds: 0.3, watchAmps: [led.id],
        events: [{ at: 0.1, componentId: button.id, parameter: 'closed', value: 1 }, { at: 0.2, componentId: button.id, parameter: 'closed', value: 0 }],
      });
      const amps = run.ampsTrace(led.id)!;
      return [0.05, 0.15, 0.29].map((seconds) => amps[Math.round(seconds * run.sampleRate)] > LIT);
    };
    expect(press(work)).toEqual([false, true, false]);
    expect(press(new Work(without(circuit, featured)))[2]).toBe(true);
  });
});

describe('the capacitor', () => {
  it('the shelf is shared out by size: the smallest are thin, then pitch, then blink, then the tank', () => {
    expect(valuesOf('capacitor-thin').map((f) => f * 1e12)).toEqual([10, 15, 22, 33, 47, 68, 100, 150].map((n) => expect.closeTo(n, 3)));
    expect([valuesOf('capacitor-pitch')[0], valuesOf('capacitor-pitch').at(-1)]).toEqual([expect.closeTo(220e-12, 15), expect.closeTo(680e-9, 12)]);
    expect([valuesOf('capacitor-blink')[0], valuesOf('capacitor-blink').at(-1)]).toEqual([expect.closeTo(1e-6, 9), expect.closeTo(22e-6, 9)]);
    expect([valuesOf('capacitor-tank')[0], valuesOf('capacitor-tank').at(-1)]).toEqual([expect.closeTo(33e-6, 9), expect.closeTo(1e-3, 6)]);
  });

  /** How loud the example is, as the swing at the Audio Out, with FULL open and closed. */
  function thin(farads: number) {
    const { work, one, featured } = made(exampleOf('capacitor', farads).example.build(farads));
    const out = one('audio-output'), full = one('switch');
    const swing = (closed: 0 | 1) => {
      const r = reading(work.bench({ seconds: 0.1, watch: [[out, 0]], set: [{ componentId: full.id, parameter: 'closed', value: closed }] }), out, 0);
      return r.max - r.min;
    };
    return { open: swing(0), closed: swing(1), featured, full };
  }

  it('thin: FULL starts open, the whole wave is the supply tall, and the capacitor passes only spikes', () => {
    const { open, closed, full, featured } = thin(100e-12);
    expect(featured.parameters.capacitance).toBe(100e-12);
    expect(full.parameters.closed).toBe(0);
    expect(closed).toBeGreaterThan(8.5);
    expect(open).toBeGreaterThan(0.5);
    // Spikes: tall for a moment, but little on average, where the whole wave is 4.5 V
    const { work, one } = made(exampleOf('capacitor', 100e-12).example.build(100e-12));
    const out = one('audio-output');
    const trace = work.bench({ seconds: 0.1, watch: [[out, 0]] }).trace(out.id, out.pins[0].id)!;
    const mean = trace.reduce((sum, v) => sum + Math.abs(v), 0) / trace.length;
    expect(mean).toBeLessThan(1);
  });

  it('thin: the smaller the capacitor, the less gets through', () => {
    const size = (farads: number) => {
      const { work, one } = made(exampleOf('capacitor', farads).example.build(farads));
      const out = one('audio-output');
      const trace = work.bench({ seconds: 0.1, watch: [[out, 0]] }).trace(out.id, out.pins[0].id)!;
      return trace.reduce((sum, v) => sum + Math.abs(v), 0) / trace.length;
    };
    let last = 0;
    for (const farads of valuesOf('capacitor-thin')) {
      const now = size(farads);
      expect(now, `${farads}`).toBeGreaterThan(last);
      last = now;
    }
  });

  /** The oscillator's pitch at the gate's output. */
  function pitch(type: string, farads?: number) {
    const chosen = exampleOf(type, farads);
    const { work, one } = made(chosen.example.build(farads));
    const chip = one('cd40106');
    const slow = farads !== undefined && farads >= 100e-9;
    const run = work.bench({ seconds: slow ? 0.5 : 0.05, watch: [[chip, CD40106.Y[0]]] });
    return { hertz: reading(run, chip, CD40106.Y[0]).hertz, chosen, run, work };
  }

  it('pitch: every value gives a note that can be heard, lower the bigger it is while the resistor is the same', () => {
    const values = valuesOf('capacitor-pitch');
    let last = Infinity, through = '';
    for (const farads of values) {
      const { hertz, chosen } = pitch('capacitor', farads);
      expect(hertz, `${farads}`).toBeGreaterThan(15);
      expect(hertz, `${farads}`).toBeLessThan(7000);
      const resistor = chosen.description.match(/fills through (\S+)\. /)![1];
      if (resistor === through) expect(hertz!, `${farads}`).toBeLessThan(last);
      through = resistor;
      last = hertz!;
    }
  });

  it('pitch: the resistor it names is the one in the circuit, 1 MΩ for the small ones and 100 kΩ from 4.7 nF', () => {
    for (const [farads, ohms, text] of [[1e-9, 1e6, '1MΩ'], [3.3e-9, 1e6, '1MΩ'], [4.7e-9, 100e3, '100kΩ'], [100e-9, 100e3, '100kΩ']] as const) {
      const chosen = exampleOf('capacitor', farads);
      const { one } = made(chosen.example.build(farads));
      expect(one('resistor').parameters.resistance).toBe(ohms);
      expect(chosen.description).toContain(`fills through ${text}.`);
    }
  });

  it('blink: slow enough to see at every value, slower the bigger it is, and the LED follows', () => {
    let last = Infinity;
    for (const farads of valuesOf('capacitor-blink')) {
      const { work, one } = made(exampleOf('capacitor', farads).example.build(farads));
      const chip = one('cd40106');
      const run = work.bench({ seconds: Math.max(2, farads * 4e5), sampleRate: 2000, watch: [[chip, CD40106.Y[1]]], watchAmps: [one('led').id] });
      const hertz = reading(run, chip, CD40106.Y[1]).hertz!;
      expect(hertz, `${farads}`).toBeLessThan(15);
      expect(hertz, `${farads}`).toBeLessThan(last);
      last = hertz;
      const amps = run.ampsTrace(one('led').id)!;
      expect(Math.max(...amps)).toBeGreaterThan(LIT);
      expect(Math.min(...amps)).toBeLessThan(DARK);
    }
  });

  /** How long the LED takes to fall to half after FILL is let go, in seconds. */
  function fade(farads: number) {
    const { work, one } = made(exampleOf('capacitor', farads).example.build(farads));
    const button = one('pushbutton'), led = one('led');
    const seconds = Math.max(1, farads * 3e4);
    const run = work.bench({
      seconds, sampleRate: 1000, watchAmps: [led.id],
      set: [{ componentId: button.id, parameter: 'closed', value: 1 }],
      events: [{ at: 0.05, componentId: button.id, parameter: 'closed', value: 0 }],
    });
    const amps = run.ampsTrace(led.id)!;
    const held = amps[0];
    const half = amps.findIndex((a, i) => i > 50 && a < held / 2);
    return { held, half: (half - 50) / 1000, dark: ledAmps(work, work.run()) };
  }

  it('tank: dark until FILL is held, lit while it is, and after it is let go the LED fades, more slowly the bigger the tank', () => {
    let last = 0;
    for (const farads of valuesOf('capacitor-tank')) {
      const { held, half, dark } = fade(farads);
      expect(dark).toBeLessThan(DARK);
      expect(held).toBeGreaterThan(LIT);
      expect(half, `${farads}`).toBeGreaterThan(last);
      last = half;
    }
    // The smallest still takes long enough to see; the biggest is over in a few seconds
    expect(fade(33e-6).half).toBeGreaterThan(0.1);
    expect(fade(1e-3).half).toBeLessThan(10);
  });
});

describe('the pot and the oscillator', () => {
  it('volume: every value. Nothing at the bottom of VOLUME, the wave at the top, half way between', () => {
    for (const ohms of stock('potentiometer')) {
      const chosen = exampleOf('potentiometer', ohms);
      expect(chosen.example.id).toBe('potentiometer-volume');
      const { work, featured, one } = made(chosen.example.build(ohms));
      expect(featured.parameters.maxResistance).toBe(ohms);
      expect(featured.label).toBe('VOLUME');
      const out = one('audio-output');
      const swing = (position: number) => {
        const r = reading(work.bench({ seconds: 0.05, watch: [[out, 0]], set: [{ componentId: featured.id, parameter: 'position', value: position }] }), out, 0);
        return r.max - r.min;
      };
      expect(swing(0), `${ohms}`).toBeLessThan(0.1);
      // All of it but for what a small pot costs the gate: 1 kΩ is a heavy load for it
      expect(swing(1), `${ohms}`).toBeGreaterThan(ohms < 5000 ? 6.5 : 8);
      expect(swing(0.5), `${ohms}`).toBeGreaterThan(2.5);
      expect(swing(0.5), `${ohms}`).toBeLessThan(5);
    }
  });

  it('oscillator and Audio Out: a square wave you can hear, and SOUND switches it off', () => {
    for (const type of ['cd40106', 'audio-output']) {
      const { work, one, featured } = made(exampleOf(type).example.build());
      expect(featured).toBe(one(type));
      const chip = one('cd40106'), out = one('audio-output'), sound = one('switch');
      expect(sound.label).toBe('SOUND');
      expect(sound.parameters.closed).toBe(1);
      const on = work.bench({ seconds: 0.1, watch: [[chip, CD40106.Y[0]], [out, 0]] });
      const hertz = reading(on, chip, CD40106.Y[0]).hertz!;
      expect(hertz).toBeGreaterThan(200);
      expect(hertz).toBeLessThan(1000);
      expect(reading(on, out, 0).max - reading(on, out, 0).min).toBeGreaterThan(8.5);
      const off = work.bench({ seconds: 0.1, watch: [[out, 0]], set: [{ componentId: sound.id, parameter: 'closed', value: 0 }] });
      expect(reading(off, out, 0).max - reading(off, out, 0).min).toBeLessThan(0.1);
    }
  });
});
