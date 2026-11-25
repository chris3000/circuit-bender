/**
 * The examples of the parts that steer a current and the parts that sense,
 * each held to what its words say: the transistors, the diodes, the
 * opto-coupler, the JFET, the photocell and the body contacts.
 */
import { describe, expect, it } from 'vitest';
import { CD40106, DARK, LIT, POT, reading, TRANSISTOR } from '@/classes/kit';
import { GATE_SUPPLY_VOLTS } from '@/examples/parts/sensorsAndSemiconductors';
import { ledBrightness } from '@/utils/ledLight';
import { exampleOf, made, withParts } from './helpers';

withParts();

const press = (id: string) => [{ componentId: id, parameter: 'closed', value: 1 }];

describe('the transistors', () => {
  for (const type of ['2n3904', '2n3906']) {
    it(`${type}: dark until PRESS is held, then lit on over a hundred times the current the button carries`, () => {
      const chosen = exampleOf(type);
      const { work, one, featured } = made(chosen.example.build());
      expect(featured).toBe(one(type));
      const button = one('pushbutton'), led = one('led');
      expect(button.label).toBe('PRESS');
      const base = work.parts('resistor').find((r) => r.parameters.resistance === 100e3)!;
      expect(work.run().amps(led.id)).toBeLessThan(DARK);
      const on = work.run(press(button.id));
      expect(on.amps(led.id)).toBeGreaterThan(0.01);
      expect(on.amps(led.id) / Math.abs(on.amps(base.id))).toBeGreaterThan(100);
      // ...and not driven past what an LED stands
      expect(on.strain(led.id)).toBeLessThan(1);
      expect(chosen.description).toContain('100 kΩ');
    });
  }

  it('the NPN has its emitter on ground; the PNP has its emitter on + and the LED below it, to ground', () => {
    const npn = made(exampleOf('2n3904').example.build());
    expect(npn.work.grounded(npn.featured, TRANSISTOR.E)).toBe(true);
    const pnp = made(exampleOf('2n3906').example.build());
    expect(pnp.work.joined(pnp.featured, TRANSISTOR.E, pnp.one('power'), 0)).toBe(true);
    expect(pnp.work.joined(pnp.featured, TRANSISTOR.C, pnp.one('led'), 0)).toBe(true);
  });
});

describe('the diodes', () => {
  for (const [type, amps] of [['1n914', '0.2 A'], ['1n4004', '1 A']] as const) {
    it(`${type}: with ON flipped only the LED behind the forwards diode lights; it stands ${amps}`, () => {
      const chosen = exampleOf(type);
      const { work, one, featured } = made(chosen.example.build());
      const [forwards, backwards] = work.parts(type);
      expect(featured).toBe(forwards);
      const [upper, lower] = work.parts('led');
      expect(upper.position.y).toBeLessThan(lower.position.y);
      const off = work.run();
      expect(off.amps(upper.id)).toBeLessThan(DARK);
      const on = work.run(press(one('switch').id));
      expect(on.amps(upper.id)).toBeGreaterThan(LIT);
      expect(on.amps(lower.id)).toBeLessThan(DARK);
      // Backwards, the diode has nearly the whole supply across it and passes nothing
      expect(on.across(backwards.id)).toBeLessThan(-7);
      // What it stands: the current at which the app calls it overloaded
      expect(on.amps(forwards.id) / on.strain(forwards.id)).toBeCloseTo(type === '1n914' ? 0.2 : 1, 6);
      expect(chosen.description).toContain(`stands ${amps}`);
    });
  }
});

describe('the opto-coupler', () => {
  it('nothing outside until PRESS is held; then the LED outside lights, and after it is let go it fades rather than going out', () => {
    const { work, one, featured, circuit } = made(exampleOf('optocoupler').example.build());
    expect(featured).toBe(one('optocoupler'));
    const button = one('pushbutton'), outside = one('led'), limit = one('resistor');
    const run = work.bench({
      seconds: 1.6, sampleRate: 2000, watchAmps: [outside.id, limit.id],
      events: [{ at: 0.3, componentId: button.id, parameter: 'closed', value: 1 }, { at: 0.8, componentId: button.id, parameter: 'closed', value: 0 }],
    });
    const amps = run.ampsTrace(outside.id)!, inside = run.ampsTrace(limit.id)!;
    const at = (seconds: number) => Math.round(seconds * run.sampleRate);
    expect(ledBrightness(amps[at(0.25)])).toBe(0);
    expect(amps[at(0.7)]).toBeGreaterThan(LIT * 10);
    // Let go: the LED inside is out at once, the one outside is still lit a twentieth of a second later, and dark after half a second
    expect(inside[at(0.81)]).toBeLessThan(DARK);
    expect(ledBrightness(amps[at(0.85)])).toBeGreaterThan(0);
    expect(ledBrightness(amps[at(1.4)])).toBe(0);
    // No wire joins the two sides but the supply's
    expect(work.joined(featured, 0, featured, 2)).toBe(false);
    expect(circuit.getConnections().some((w) => w.from.componentId === limit.id && w.to.componentId === outside.id)).toBe(false);
  });
});

describe('the JFET', () => {
  function at(position: number) {
    const { work, one } = made(exampleOf('2n5457').example.build());
    const knob = one('potentiometer'), q = one('2n5457');
    const run = work.bench({ set: [{ componentId: knob.id, parameter: 'position', value: position }], watch: [[q, 0]] });
    return { gate: reading(run, q, 0).mean, amps: run.amps(one('led').id) };
  }

  it('GATE starts turned up, the gate level with the source, and the LED lit', () => {
    const { one } = made(exampleOf('2n5457').example.build());
    expect(one('potentiometer').label).toBe('GATE');
    expect(one('potentiometer').parameters.position).toBe(1);
    expect(Math.abs(at(1).gate)).toBeLessThan(0.01);
    expect(at(1).amps).toBeGreaterThan(LIT);
  });

  it('turned down, the LED dims all the way, and is out with the gate 1.4 V below the source', () => {
    let last = Infinity;
    for (const position of [1, 0.8, 0.6, 0.4, 0.2]) {
      const { amps } = at(position);
      expect(amps, `${position}`).toBeLessThan(last);
      last = amps;
    }
    // The knob's share of the way down to the second supply's bottom that puts the gate at −1.4 V
    const shut = at(1 - 1.4 / GATE_SUPPLY_VOLTS);
    expect(shut.gate).toBeCloseTo(-1.4, 2);
    expect(shut.amps).toBeLessThan(DARK);
    expect(at(0).gate).toBeCloseTo(-GATE_SUPPLY_VOLTS, 2);
  });

  it('the gate takes no current: it sits exactly where the knob divides the second supply', () => {
    for (const position of [0.25, 0.5, 0.75]) expect(at(position).gate).toBeCloseTo(-GATE_SUPPLY_VOLTS * (1 - position), 3);
    const { work, one } = made(exampleOf('2n5457').example.build());
    expect(work.grounded(one('potentiometer'), POT.END3)).toBe(true);
  });
});

describe('the photocell and the body contacts', () => {
  it('photocell: the more light on it, the more light from the LED; 1 MΩ in the dark and 1 kΩ in full light', () => {
    const { work, one, featured } = made(exampleOf('ldr').example.build());
    expect(featured).toBe(one('ldr'));
    const run = (light: number) => work.run([{ componentId: featured.id, parameter: 'light', value: light }]);
    let last = 0;
    for (const light of [0, 0.25, 0.5, 0.75, 1]) {
      const amps = run(light).amps(one('led').id);
      expect(amps, `${light}`).toBeGreaterThan(last);
      last = amps;
    }
    const ohms = (light: number) => run(light).across(featured.id) / run(light).amps(featured.id);
    expect(ohms(0)).toBeCloseTo(1e6, -3);
    expect(ohms(1)).toBeCloseTo(1e3, 0);
    expect(run(1).amps(one('led').id)).toBeGreaterThan(LIT * 10);
  });

  /** The note at the gate's output with the contacts touched this hard. */
  function note(touch: number) {
    const { work, one } = made(exampleOf('body-contact').example.build());
    const pads = one('body-contact'), chip = one('cd40106');
    const run = work.bench({ seconds: 0.2, set: [{ componentId: pads.id, parameter: 'touch', value: touch }], watch: [[chip, CD40106.Y[0]]] });
    return reading(run, chip, CD40106.Y[0]);
  }

  it('body contacts: no note untouched; a note when touched, higher the firmer the press', () => {
    const { one, featured } = made(exampleOf('body-contact').example.build());
    expect(featured).toBe(one('body-contact'));
    expect(featured.label).toBe('TOUCH');
    const still = note(0);
    expect(still.hertz).toBeNull();
    let last = 0;
    for (const touch of [0.2, 0.5, 1]) {
      const { hertz, max, min } = note(touch);
      expect(hertz, `${touch}`).toBeGreaterThan(Math.max(last, 20));
      expect(max - min).toBeGreaterThan(8.5);
      last = hertz!;
    }
    expect(last).toBeLessThan(15000);
  });
});
