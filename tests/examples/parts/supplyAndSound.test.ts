/**
 * The examples of the supply, the signal from outside, the piezo disc, the
 * LM386 and its speaker, the junction and the changeover switch, each held to
 * what its words say.
 */
import { describe, expect, it } from 'vitest';
import { DARK, LED, LIT, LM386, POWER, ledAmps, reading, swing } from '@/classes/kit';
import { Work } from '@/classes/Work';
import { SIGNAL_WAVE_NAMES } from '@/components/definitions/AudioInput';
import { connect } from '@/examples/circuits';
import { WEAK_VOLTS } from '@/examples/parts/supplyAndSound';
import { removeFromCircuit } from '@/utils/circuitEdits';
import { ledBrightness } from '@/utils/ledLight';
import type { Component } from '@/types/circuit';
import { definition, exampleOf, made, withParts, without } from './helpers';

withParts();

/** The lowest and highest of a stretch of a trace, from `from` to `to` seconds. */
function span(trace: ArrayLike<number>, sampleRate: number, from: number, to: number): { min: number; max: number; swing: number } {
  let min = Infinity, max = -Infinity;
  for (let i = Math.round(from * sampleRate); i < Math.min(trace.length, Math.round(to * sampleRate)); i++) {
    min = Math.min(min, trace[i]);
    max = Math.max(max, trace[i]);
  }
  return { min, max, swing: max - min };
}

describe('the supply', () => {
  const built = () => {
    const { work, one, featured } = made(exampleOf('power').example.build());
    const led = one('led');
    const starved = (starve: number) => work.run([{ componentId: featured.id, parameter: 'starve', value: starve }], 0.05);
    return { work, led, supply: featured, starved };
  };

  it('holds + 9 V above −, which is on ground, and the LED is lit from the start', () => {
    const { work, led, supply } = built();
    expect(supply).toBe(work.parts('power')[0]);
    expect(supply.parameters.starve).toBe(0);
    expect(work.grounded(supply, POWER.MINUS)).toBe(true);
    const run = work.run();
    expect(run.across(supply.id)).toBeCloseTo(9, 6);
    // Out at +, through the LED from A to K, and back by ground
    expect(run.amps(led.id) * 1000).toBeCloseTo(6.9, 1);
    expect(run.strain(led.id)).toBeLessThan(1);
  });

  it('STARVE is the name of its knob, and the further it is turned the dimmer the LED, down to almost out', () => {
    const { led, starved } = built();
    const knobs = [definition('power').cover!].flat();
    expect(knobs.some((control) => control.parameter === 'starve' && control.name === 'STARVE')).toBe(true);
    let last = Infinity;
    for (const starve of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
      const amps = starved(starve).amps(led.id);
      expect(amps, `${starve}`).toBeLessThan(last);
      last = amps;
    }
    // Half way round it has lost most of its light; at the end it is on the faintest step there is, not off
    expect(ledBrightness(starved(0).amps(led.id))).toBeGreaterThan(0.6);
    expect(ledBrightness(starved(0.5).amps(led.id))).toBeLessThan(0.3);
    expect(ledBrightness(last)).toBe(0.05);
    expect(last).toBeGreaterThan(DARK);
  });
});

describe('the amplifier: Audio In, the LM386 and the speaker', () => {
  type Change = { componentId: string; parameter: string; value: number };

  function built(type: string) {
    const { circuit, work, one, featured } = made(exampleOf(type).example.build());
    const input = one('audio-input'), amp = one('lm386'), speaker = one('speaker'), pass = one('capacitor'), supply = one('power');
    const listen = (set: Array<[parameter: string, value: number]> = [], seconds = 0.2) => {
      const changes: Change[] = set.map(([parameter, value]) => ({ componentId: input.id, parameter, value }));
      const run = work.bench({ seconds, watch: [[amp, LM386.IN_PLUS], [amp, LM386.OUT], [speaker, 0]], watchAmps: [speaker.id], set: changes });
      return {
        run,
        fed: reading(run, amp, LM386.IN_PLUS),
        out: reading(run, amp, LM386.OUT),
        heard: reading(run, speaker, 0),
        peakAmps: Math.max(...run.ampsTrace(speaker.id)!.map(Math.abs)),
      };
    };
    return { circuit, work, featured, input, amp, speaker, pass, supply, listen };
  }

  /** The same Audio In and speaker with no amplifier between them. */
  function unamplified() {
    const { circuit, input, amp, speaker, pass } = built('speaker');
    const bare = without(without(circuit, amp), pass).addConnection(connect(input, 0, speaker, 0));
    const work = new Work(bare);
    const run = work.bench({ seconds: 0.2, watch: [[speaker, 0]], watchAmps: [speaker.id] });
    return { heard: reading(run, speaker, 0), sound: run.sound, peakAmps: Math.max(...run.ampsTrace(speaker.id)!.map(Math.abs)) };
  }

  it('one circuit for the three of them, each pointing at its own part, with LEVEL all the way up', () => {
    for (const type of ['audio-input', 'lm386', 'speaker']) {
      const { work, featured, input } = built(type);
      expect(featured).toBe(work.parts(type)[0]);
      expect(input.label).toBe('LEVEL');
      expect(input.parameters.level).toBe(1);
      expect(input.parameters.wave).toBe(0);
      expect(input.parameters.volts).toBe(WEAK_VOLTS);
      // LEVEL is a knob on the part and on the cover
      expect(definition('audio-input').control).toMatchObject({ kind: 'dial', parameter: 'level' });
      expect(definition('audio-input').cover).toMatchObject({ control: 'knob', parameter: 'level' });
    }
  });

  it('Audio In: a steady tone at its pitch, turned down by LEVEL and gone at the bottom', () => {
    const { input, listen } = built('audio-input');
    const full = listen();
    expect(full.heard.hertz).toBeCloseTo(Number(input.parameters.frequency), 0);
    expect(swing(full.heard)).toBeGreaterThan(3);
    expect(swing(listen([['level', 0.5]]).heard) / swing(full.heard)).toBeCloseTo(0.5, 2);
    expect(swing(listen([['level', 0]]).heard)).toBeLessThan(1e-3);
    expect(swing(listen([['level', 0]]).run.sound)).toBeLessThan(1e-3);
  });

  it('Audio In: too weak to move a speaker by itself, strong enough through the amplifier', () => {
    const { listen } = built('audio-input');
    const bare = unamplified();
    expect(swing(bare.heard)).toBeLessThan(0.01);
    expect(swing(bare.sound)).toBeLessThan(0.001);
    expect(swing(listen().heard)).toBeGreaterThan(1000 * swing(bare.heard));
    expect(swing(listen().run.sound)).toBeGreaterThan(0.3);
  });

  it('Audio In: the signals the text names are there to choose, each is its own sound, and Pitch sets the pitch', () => {
    const { amp, listen } = built('audio-input');
    expect([SIGNAL_WAVE_NAMES[2], SIGNAL_WAVE_NAMES[4], SIGNAL_WAVE_NAMES[5]]).toEqual(['Square', 'Plucked string', 'Noise']);
    /** How much of its time a signal spends near its peaks: all of it for a square, less for a sine. */
    const fullness = (wave: number) => {
      const { run, fed } = listen([['wave', wave]]);
      const trace = run.trace(amp.id, amp.pins[LM386.IN_PLUS].id)!;
      return trace.reduce((sum, v) => sum + Math.abs(v), 0) / trace.length / fed.max;
    };
    expect(fullness(0)).toBeCloseTo(2 / Math.PI, 1);
    expect(fullness(2)).toBeGreaterThan(0.95);
    // A plucked string dies away between plucks
    const plucked = listen([['wave', 4]], 1);
    const string = plucked.run.trace(amp.id, amp.pins[LM386.IN_PLUS].id)!;
    expect(span(string, plucked.run.sampleRate, 0.9, 1).swing).toBeLessThan(span(string, plucked.run.sampleRate, 0, 0.1).swing / 2);
    // Noise is heard, and has no pitch of its own: nothing like the tone's
    const noise = listen([['wave', 5]]);
    expect(swing(noise.heard)).toBeGreaterThan(1);
    expect(noise.heard.hertz === null || noise.heard.hertz > 1000).toBe(true);
    expect(listen([['frequency', 440]]).heard.hertz).toBeCloseTo(440, 0);
  });

  it('LM386: about 20 times what is at its + input, resting at half the supply', () => {
    const { amp, supply, listen } = built('lm386');
    expect(amp.parameters.gain).toBe(20);
    const { run, fed, out } = listen();
    // A little under 20 with the speaker pulling on it
    expect(swing(out) / swing(fed)).toBeGreaterThan(18);
    expect(swing(out) / swing(fed)).toBeLessThan(20);
    // Clear of both rails: the tone is not clipped
    expect(out.min).toBeGreaterThan(2);
    expect(out.max).toBeLessThan(7);
    expect(listen([['level', 0]]).out.mean).toBeCloseTo(run.across(supply.id) / 2, 2);
    expect(run.across(supply.id)).toBeCloseTo(9, 6);
  });

  it('LM386: the capacitor passes the tone and holds the steady voltage back, and less LEVEL is a quieter speaker', () => {
    const { speaker, pass, listen } = built('lm386');
    expect(pass.parameters.capacitance).toBe(220e-6);
    const { run, out, heard } = listen();
    expect(swing(heard)).toBeGreaterThan(0.9 * swing(out));
    expect(Math.abs(run.across(speaker.id))).toBeLessThan(0.01);
    expect(run.across(pass.id)).toBeCloseTo(4.5, 1);
    expect(swing(listen([['level', 0.25]]).heard) / swing(heard)).toBeCloseTo(0.25, 2);
  });

  it('speaker: it takes far more current than Audio In gives by itself, and the amplifier gives it', () => {
    const { speaker, supply, listen } = built('speaker');
    expect(speaker.parameters.impedance).toBe(8);
    const { run, peakAmps } = listen();
    expect(peakAmps).toBeGreaterThan(0.2);
    expect(unamplified().peakAmps).toBeLessThan(peakAmps / 1000);
    // No steady voltage on the coil, and nothing overloaded in giving it
    expect(Math.abs(run.across(speaker.id))).toBeLessThan(0.01);
    expect(run.strain(supply.id)).toBeLessThan(1);
    expect(listen([['level', 0.5]]).peakAmps / peakAmps).toBeCloseTo(0.5, 2);
  });
});

describe('the piezo disc', () => {
  it('silent until pressed, then one knock that rings and dies away, and no more until it is pressed again', () => {
    const { work, one, featured } = made(exampleOf('piezo').example.build());
    const amp = one('lm386'), out = one('audio-output');
    expect(featured).toBe(one('piezo'));
    expect(featured.label).toBe('KNOCK');
    expect(featured.parameters.tap).toBe(0);
    expect(work.joined(amp, LM386.OUT, out, 0)).toBe(true);

    const tap = (at: number, value: number) => ({ at, componentId: featured.id, parameter: 'tap', value });
    const run = work.bench({
      seconds: 1.2, watch: [[amp, LM386.IN_PLUS], [amp, LM386.OUT]],
      events: [tap(0.1, 1), tap(0.9, 0), tap(1, 1)],
    });
    const disc = run.trace(amp.id, amp.pins[LM386.IN_PLUS].id)!;
    const louder = run.trace(amp.id, amp.pins[LM386.OUT].id)!;
    const between = (trace: ArrayLike<number>, from: number, to: number) => span(trace, run.sampleRate, from, to);

    expect(between(run.soundTrace, 0, 0.1).swing).toBeLessThan(1e-6);
    // The knock itself is small: a few tenths of a volt
    const knock = between(disc, 0.1, 0.12);
    expect(knock.max).toBeGreaterThan(0.15);
    expect(knock.max).toBeLessThan(0.5);
    // Through the amplifier it is volts, and as loud as anything gets
    expect(between(louder, 0.1, 0.12).swing).toBeGreaterThan(10 * knock.swing);
    expect(between(run.soundTrace, 0.1, 0.12).swing).toBeGreaterThan(0.5);
    // It rings on for a moment, and dies away while the disc is still held
    expect(between(run.soundTrace, 0.12, 0.2).swing).toBeGreaterThan(0.1);
    expect(between(run.soundTrace, 0.3, 0.5).swing).toBeLessThan(between(run.soundTrace, 0.1, 0.12).swing / 50);
    expect(between(run.soundTrace, 0.5, 0.9).swing).toBeLessThan(1e-3);
    // Letting go is not a knock; pressing again is
    expect(between(run.soundTrace, 0.9, 1).swing).toBeLessThan(1e-3);
    expect(between(run.soundTrace, 1, 1.02).swing).toBeGreaterThan(0.5);
  });
});

describe('the junction and the changeover switch', () => {
  it('junction: BOTH starts open; closed, the two LEDs light together with the same current', () => {
    const { circuit, work, one, featured } = made(exampleOf('junction').example.build());
    const both = one('switch');
    const [upper, lower] = work.parts('led');
    expect(featured).toBe(one('junction'));
    expect(both.label).toBe('BOTH');
    expect(both.parameters.closed).toBe(0);
    // Three wires meet at the dot: the one from the switch and one for each LED
    const onDot = circuit.getConnections().filter((w) => w.from.componentId === featured.id || w.to.componentId === featured.id);
    expect(onDot).toHaveLength(3);
    expect(work.joined(featured, 0, both, 1)).toBe(true);

    const close = [{ componentId: both.id, parameter: 'closed', value: 1 }];
    expect(ledAmps(work, work.run())).toBeLessThan(DARK);
    const lit = work.run(close);
    expect(lit.amps(upper.id)).toBeGreaterThan(LIT);
    expect(lit.amps(lower.id)).toBeCloseTo(lit.amps(upper.id), 9);
  });

  it('junction: deleted, its wires go with it and both LEDs stay dark', () => {
    const { circuit, one, featured } = made(exampleOf('junction').example.build());
    const deleted = removeFromCircuit(circuit, [featured.id]);
    expect(deleted.getComponents()).toHaveLength(circuit.getComponents().length - 1);
    expect(deleted.getConnections()).toHaveLength(circuit.getConnections().length - 3);
    const work = new Work(deleted);
    expect(ledAmps(work, work.run([{ componentId: one('switch').id, parameter: 'closed', value: 1 }]))).toBeLessThan(DARK);
  });

  it('changeover: COM is joined to A or to B and never to both, and it starts on A', () => {
    const { work, one, featured } = made(exampleOf('spdt').example.build());
    const [COM, A, B] = [0, 1, 2];
    expect(featured).toBe(one('spdt'));
    expect(featured.label).toBe('SELECT');
    expect(featured.parameters.throw).toBe(0);
    expect(featured.pins.map((pin) => pin.label)).toEqual(['COM', 'A', 'B']);
    const led = (name: string): Component => work.parts('led').find((l) => l.label === name)!;
    expect(work.joined(featured, A, led('A'), LED.A)).toBe(true);
    expect(work.joined(featured, B, led('B'), LED.A)).toBe(true);
    // COM comes from the supply, through the resistor
    const limit = one('resistor');
    expect(work.joined(limit, 0, one('power'), POWER.PLUS)).toBe(true);
    expect(work.joined(limit, 1, featured, COM)).toBe(true);

    const thrown = (to: 0 | 1) => work.run([{ componentId: featured.id, parameter: 'throw', value: to }]);
    expect(work.run().amps(led('A').id)).toBeGreaterThan(LIT);
    expect(thrown(0).amps(led('A').id)).toBeGreaterThan(LIT);
    expect(thrown(0).amps(led('B').id)).toBeLessThan(DARK);
    expect(thrown(1).amps(led('A').id)).toBeLessThan(DARK);
    expect(thrown(1).amps(led('B').id)).toBeGreaterThan(LIT);
    expect(thrown(1).amps(led('B').id)).toBeCloseTo(thrown(0).amps(led('A').id), 9);
  });
});
