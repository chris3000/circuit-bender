/**
 * Semiconductor and op-amp models, checked inside the solver against their
 * own device equations (not against loose "somewhere around 0.6 V" bounds).
 */
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS, type OpAmpParams } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';
import { BOLTZMANN_VOLTAGE } from '@/simulation/models/junctionUtils';

const SR = 48000;
const DT = 1 / SR;

function registry(opamp: OpAmpParams = OPAMP_LM741_PARAMS): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(opamp));
  reg.register('cd40106', () => new SchmittTriggerModel());
  return reg;
}

type Params = Record<string, number | string | boolean>;
const comp = (id: string, type: string, pins: Array<[string, string]>, parameters: Params = {}) =>
  ({ id, type, pins: pins.map(([pid, ptype]) => ({ id: pid, label: pid, type: ptype })), parameters });
const wire = (fc: string, fp: string, tc: string, tp: string) =>
  ({ id: `${fc}.${fp}-${tc}.${tp}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } });
const twoPin: Array<[string, string]> = [['a', 'bidirectional'], ['b', 'bidirectional']];
const bjtPins: Array<[string, string]> = [['b', 'bidirectional'], ['c', 'bidirectional'], ['e', 'bidirectional']];
const opPins: Array<[string, string]> = [['inm', 'input'], ['inp', 'input'], ['vneg', 'power'], ['out', 'output'], ['vpos', 'power']];
const icPins: Array<[string, string]> = Array.from({ length: 14 }, (_, i) =>
  [`p${i}`, i === 12 ? 'power' : i === 13 ? 'ground' : 'bidirectional']);
const res = (id: string, resistance: number) => comp(id, 'resistor', twoPin, { resistance });
const source = (id: string, voltage: number) => comp(id, 'power', [['pos', 'power'], ['neg', 'ground']], { voltage });
const supply = (voltage = 9) => [source('pwr', voltage), comp('gnd', 'ground', [['gnd', 'ground']])];
const supplyWires = () => [wire('pwr', 'neg', 'gnd', 'gnd')];

function build(components: ReturnType<typeof comp>[], wires: ReturnType<typeof wire>[], opamp?: OpAmpParams) {
  const solver = new MNASolver(registry(opamp));
  solver.loadCircuit(components as never, wires as never);
  return solver;
}

/** Find the root of an increasing function by bisection. */
function bisect(f: (v: number) => number, lo: number, hi: number): number {
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) hi = mid; else lo = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------

describe('diode', () => {
  function diodeCircuit(type: string, resistance: number) {
    return build(
      [...supply(), res('r', resistance), comp('d', type, twoPin)],
      [...supplyWires(), wire('pwr', 'pos', 'r', 'a'), wire('r', 'b', 'd', 'a'), wire('d', 'b', 'gnd', 'gnd')],
    );
  }

  /** Anode voltage solving (9 − V)/R = Is·(e^(Vj/nVt) − 1) with V = Vj + I·Rs. */
  function expectedAnode(p: { Is: number; n: number; Rs: number }, resistance: number): number {
    const nVt = p.n * BOLTZMANN_VOLTAGE;
    const vj = bisect(v => {
      const i = p.Is * (Math.exp(v / nVt) - 1);
      return v + i * (p.Rs + resistance) - 9;
    }, 0, 5);
    return vj + p.Is * (Math.exp(vj / nVt) - 1) * p.Rs;
  }

  it('reaches the exact Shockley operating point in a single step', () => {
    const solver = diodeCircuit('1n914', 1000);
    solver.step(DT);
    expect(solver.getNodeVoltageByPin('d', 'a')).toBeCloseTo(expectedAnode(DIODE_1N914_PARAMS, 1000), 5);
  });

  it('is exact across six decades of current', () => {
    for (const r of [100, 10e3, 1e6, 100e6]) {
      const solver = diodeCircuit('1n914', r);
      solver.step(DT);
      expect(solver.getNodeVoltageByPin('d', 'a')).toBeCloseTo(expectedAnode(DIODE_1N914_PARAMS, r), 4);
    }
  });

  it('converges for an LED driven hard through a small resistor', () => {
    const solver = diodeCircuit('led', 10);
    solver.step(DT);
    expect(solver.getNodeVoltageByPin('d', 'a')).toBeCloseTo(expectedAnode(DIODE_LED_RED_PARAMS, 10), 4);
  });

  it('blocks in reverse', () => {
    const solver = build(
      [...supply(), res('r', 10000), comp('d', '1n914', twoPin)],
      [...supplyWires(), wire('pwr', 'pos', 'r', 'a'), wire('r', 'b', 'd', 'b'), wire('d', 'a', 'gnd', 'gnd')],
    );
    solver.step(DT);
    // Only the saturation current (2.5 nA) flows: 25 µV across 10k
    expect(solver.getNodeVoltageByPin('d', 'b')).toBeGreaterThan(8.999);
  });
});

// ---------------------------------------------------------------------------

describe('transistor', () => {
  const model = new BJTModel(BJT_2N3904_PARAMS);
  const { RB, RC, RE } = BJT_2N3904_PARAMS;

  it('stamps derivatives that match the currents (finite differences)', () => {
    const points: Array<[number, number]> = [
      [0.65, -4],     // forward active
      [0.72, 0.6],    // saturation
      [0.80, -1],     // high injection
      [-2, 0.6],      // reverse active
      [-1, -3],       // cut off
      [0.3, 0.2],     // barely conducting
    ];
    const h = 1e-7;
    for (const [vbe, vbc] of points) {
      const op = model.evaluate(vbe, vbc);
      const dBe = model.evaluate(vbe + h, vbc), dBe0 = model.evaluate(vbe - h, vbc);
      const dBc = model.evaluate(vbe, vbc + h), dBc0 = model.evaluate(vbe, vbc - h);
      const check = (analytic: number, hi: number, lo: number) => {
        const numeric = (hi - lo) / (2 * h);
        expect(Math.abs(analytic - numeric)).toBeLessThan(1e-5 * Math.abs(numeric) + 1e-11);
      };
      check(op.dIc_dVbe, dBe.Ic, dBe0.Ic);
      check(op.dIc_dVbc, dBc.Ic, dBc0.Ic);
      check(op.dIb_dVbe, dBe.Ib, dBe0.Ib);
      check(op.dIb_dVbc, dBc.Ib, dBc0.Ib);
    }
  });

  it('has a current gain near the datasheet value in the active region', () => {
    const op = model.evaluate(0.65, -4);
    expect(op.Ic / op.Ib).toBeGreaterThan(300);
    expect(op.Ic / op.Ib).toBeLessThan(600);
    expect(op.Ic).toBeGreaterThan(0.2e-3);
    expect(op.Ic).toBeLessThan(2e-3);
  });

  function commonEmitter(rBase: number, rCollector: number) {
    return build(
      [...supply(), res('rb', rBase), res('rc', rCollector), comp('q', '2n3904', bjtPins)],
      [...supplyWires(),
        wire('pwr', 'pos', 'rb', 'a'), wire('rb', 'b', 'q', 'b'),
        wire('pwr', 'pos', 'rc', 'a'), wire('rc', 'b', 'q', 'c'),
        wire('q', 'e', 'gnd', 'gnd')],
    );
  }

  /** How far the solved terminal voltages are from satisfying the device equations (amps). */
  function residual(solver: MNASolver, rBase: number, rCollector: number) {
    const vB = solver.getNodeVoltageByPin('q', 'b');
    const vC = solver.getNodeVoltageByPin('q', 'c');
    const iB = (9 - vB) / rBase;
    const iC = (9 - vC) / rCollector;
    // Step inside the parasitic resistances to the intrinsic junctions
    const vBi = vB - iB * RB, vCi = vC - iC * RC, vEi = (iB + iC) * RE;
    const op = model.evaluate(vBi - vEi, vBi - vCi);
    return { vB, vC, iB, iC, errC: Math.abs(op.Ic - iC), errB: Math.abs(op.Ib - iB) };
  }

  it('solves a saturated switch exactly in a single step', () => {
    const solver = commonEmitter(100e3, 1000);
    solver.step(DT);
    const r = residual(solver, 100e3, 1000);
    expect(r.errC).toBeLessThan(1e-7);
    expect(r.errB).toBeLessThan(1e-9);
    expect(r.vC).toBeLessThan(0.3);     // saturated
    expect(r.vC).toBeGreaterThan(0.02);
    expect(r.vB).toBeGreaterThan(0.6);
    expect(r.vB).toBeLessThan(0.8);
  });

  it('solves an active-region amplifier exactly in a single step', () => {
    const solver = commonEmitter(2.2e6, 1000);
    solver.step(DT);
    const r = residual(solver, 2.2e6, 1000);
    expect(r.errC).toBeLessThan(1e-7);
    expect(r.errB).toBeLessThan(1e-9);
    expect(r.vC).toBeGreaterThan(5);    // not saturated
    expect(r.vC).toBeLessThan(8.5);     // conducting
    expect(r.iC / r.iB).toBeGreaterThan(300);
  });

  it('stays at its operating point instead of creeping towards it', () => {
    const solver = commonEmitter(100e3, 1000);
    solver.step(DT);
    const first = solver.getNodeVoltageByPin('q', 'c');
    for (let i = 0; i < 200; i++) solver.step(DT);
    expect(solver.getNodeVoltageByPin('q', 'c')).toBeCloseTo(first, 6);
  });

  it('works as an emitter follower', () => {
    const solver = build(
      [...supply(), res('r1', 10e3), res('r2', 10e3), res('re', 1000), comp('q', '2n3904', bjtPins)],
      [...supplyWires(),
        wire('pwr', 'pos', 'r1', 'a'), wire('r1', 'b', 'r2', 'a'), wire('r2', 'b', 'gnd', 'gnd'),
        wire('r1', 'b', 'q', 'b'), wire('pwr', 'pos', 'q', 'c'),
        wire('q', 'e', 're', 'a'), wire('re', 'b', 'gnd', 'gnd')],
    );
    solver.step(DT);
    const vB = solver.getNodeVoltageByPin('q', 'b');
    const vE = solver.getNodeVoltageByPin('q', 'e');
    expect(vB).toBeGreaterThan(4.3);   // base current barely loads the divider
    expect(vB - vE).toBeGreaterThan(0.6);
    expect(vB - vE).toBeLessThan(0.75);
  });

  it('switches cleanly when driven by a Schmitt oscillator', () => {
    // Oscillator (10k, 100nF ≈ 1.26 kHz) drives the base through 10k; the
    // collector should be an inverted rail-to-rail copy at the same frequency.
    const solver = build(
      [...supply(), res('r', 10e3), comp('c', 'capacitor', twoPin, { capacitance: 100e-9 }),
        comp('ic', 'cd40106', icPins), res('rb', 10e3), res('rc', 1000), comp('q', '2n3904', bjtPins)],
      [...supplyWires(), wire('pwr', 'pos', 'ic', 'p12'), wire('gnd', 'gnd', 'ic', 'p13'),
        wire('r', 'a', 'ic', 'p0'), wire('r', 'b', 'ic', 'p6'),
        wire('c', 'a', 'ic', 'p0'), wire('c', 'b', 'gnd', 'gnd'),
        wire('ic', 'p6', 'rb', 'a'), wire('rb', 'b', 'q', 'b'),
        wire('pwr', 'pos', 'rc', 'a'), wire('rc', 'b', 'q', 'c'), wire('q', 'e', 'gnd', 'gnd')],
    );
    solver.setProbes([{ componentId: 'q', pinId: 'c' }, { componentId: 'ic', pinId: 'p6' }]);
    for (let i = 0; i < 2000; i++) solver.step(DT);
    let lo = Infinity, hi = -Infinity, opposite = 0, edges = 0, prev = 0;
    const N = 9600;
    for (let i = 0; i < N; i++) {
      solver.step(DT);
      const c = solver.getProbeSample(0), g = solver.getProbeSample(1);
      lo = Math.min(lo, c); hi = Math.max(hi, c);
      if ((c > 4.5) !== (g > 4.5)) opposite++;
      if (i > 0 && prev < 4.5 && c >= 4.5) edges++;
      prev = c;
    }
    expect(lo).toBeLessThan(0.2);
    expect(hi).toBeGreaterThan(8.9);
    expect(opposite / N).toBeGreaterThan(0.95);
    const freq = edges / (N / SR);
    expect(freq).toBeGreaterThan(1200);
    expect(freq).toBeLessThan(1300);
  });
});

// ---------------------------------------------------------------------------

describe('op-amp', () => {
  /** Inverting amplifier biased at mid-supply: out = 4.5 − (rf/rin)·(vin − 4.5). */
  function inverting(vin: number, rin: number, rf: number) {
    return build(
      [...supply(), source('vin', vin), res('b1', 10e3), res('b2', 10e3), res('rin', rin), res('rf', rf),
        comp('u', 'lm741', opPins)],
      [...supplyWires(), wire('vin', 'neg', 'gnd', 'gnd'),
        wire('pwr', 'pos', 'u', 'vpos'), wire('gnd', 'gnd', 'u', 'vneg'),
        wire('pwr', 'pos', 'b1', 'a'), wire('b1', 'b', 'b2', 'a'), wire('b2', 'b', 'gnd', 'gnd'), wire('b1', 'b', 'u', 'inp'),
        wire('vin', 'pos', 'rin', 'a'), wire('rin', 'b', 'u', 'inm'),
        wire('u', 'out', 'rf', 'a'), wire('rf', 'b', 'u', 'inm')],
    );
  }

  /** Voltage follower fed from an adjustable source. */
  function follower(vin: number, params?: OpAmpParams) {
    return build(
      [...supply(), source('vin', vin), comp('u', 'lm741', opPins), res('load', 10e3)],
      [...supplyWires(), wire('vin', 'neg', 'gnd', 'gnd'),
        wire('pwr', 'pos', 'u', 'vpos'), wire('gnd', 'gnd', 'u', 'vneg'),
        wire('vin', 'pos', 'u', 'inp'), wire('u', 'out', 'u', 'inm'),
        wire('u', 'out', 'load', 'a'), wire('load', 'b', 'gnd', 'gnd')],
      params,
    );
  }

  it('gives the closed-loop gain set by its resistors', () => {
    const solver = inverting(4.6, 10e3, 100e3);
    for (let i = 0; i < 50; i++) solver.step(DT);
    expect(solver.getNodeVoltageByPin('u', 'out')).toBeCloseTo(3.5, 2);
  });

  it('holds its inputs together (virtual short)', () => {
    const solver = inverting(4.3, 10e3, 47e3);
    for (let i = 0; i < 50; i++) solver.step(DT);
    const diff = solver.getNodeVoltageByPin('u', 'inp') - solver.getNodeVoltageByPin('u', 'inm');
    expect(Math.abs(diff)).toBeLessThan(1e-3);
    expect(solver.getNodeVoltageByPin('u', 'out')).toBeCloseTo(4.5 + 0.2 * 4.7, 2);
  });

  it('follows its input as a unity-gain buffer', () => {
    for (const v of [2, 4.5, 7]) {
      const solver = follower(v);
      for (let i = 0; i < 20; i++) solver.step(DT);
      expect(solver.getNodeVoltageByPin('u', 'out')).toBeCloseTo(v, 3);
    }
  });

  it('clips 1.5 V inside each supply rail, like a real 741', () => {
    const high = inverting(3.0, 10e3, 100e3);   // asks for 19.5 V
    const low = inverting(6.0, 10e3, 100e3);    // asks for −10.5 V
    for (let i = 0; i < 50; i++) { high.step(DT); low.step(DT); }
    expect(high.getNodeVoltageByPin('u', 'out')).toBeCloseTo(7.5, 1);
    expect(low.getNodeVoltageByPin('u', 'out')).toBeCloseTo(1.5, 1);
  });

  it('recovers from clipping without winding up', () => {
    const solver = inverting(3.0, 10e3, 100e3);
    for (let i = 0; i < 500; i++) solver.step(DT);   // sit on the rail for a while
    solver.updateParam('vin', 'voltage', 4.6);
    for (let i = 0; i < 3; i++) solver.step(DT);
    expect(solver.getNodeVoltageByPin('u', 'out')).toBeCloseTo(3.5, 2);
  });

  it('limits its output slope to the slew rate', () => {
    const slewRate = 2e4;   // V/s, slowed down so the ramp spans many samples
    const solver = follower(2, { ...OPAMP_LM741_PARAMS, slewRate });
    for (let i = 0; i < 50; i++) solver.step(DT);
    solver.updateParam('vin', 'voltage', 6);
    const v: number[] = [];
    for (let i = 0; i < 6; i++) { solver.step(DT); v.push(solver.getNodeVoltageByPin('u', 'out')); }
    const perSample = slewRate * DT;
    for (let i = 1; i < v.length; i++) {
      expect(v[i] - v[i - 1]).toBeGreaterThan(perSample * 0.98);
      expect(v[i] - v[i - 1]).toBeLessThan(perSample * 1.02);
    }
    for (let i = 0; i < 50; i++) solver.step(DT);
    expect(solver.getNodeVoltageByPin('u', 'out')).toBeCloseTo(6, 3);   // settles without overshoot
  });

  it('has the bandwidth its gain-bandwidth product implies', () => {
    // Non-inverting gain of 100 with GBW = 100 kHz → closed-loop corner at
    // 1 kHz, i.e. a step response time constant of 159 µs (7.6 samples).
    const params = { ...OPAMP_LM741_PARAMS, GBW: 100e3 };
    const solver = build(
      [...supply(), source('vin', 0.03), comp('u', 'lm741', opPins), res('rf', 99e3), res('rg', 1e3)],
      [...supplyWires(), wire('vin', 'neg', 'gnd', 'gnd'),
        wire('pwr', 'pos', 'u', 'vpos'), wire('gnd', 'gnd', 'u', 'vneg'),
        wire('vin', 'pos', 'u', 'inp'),
        wire('u', 'out', 'rf', 'a'), wire('rf', 'b', 'u', 'inm'),
        wire('u', 'inm', 'rg', 'a'), wire('rg', 'b', 'gnd', 'gnd')],
      params,
    );
    for (let i = 0; i < 400; i++) solver.step(DT);
    const start = solver.getNodeVoltageByPin('u', 'out');
    expect(start).toBeCloseTo(3.0, 1);
    solver.updateParam('vin', 'voltage', 0.04);     // +10 mV in → +1 V out
    let samples = 0;
    while (solver.getNodeVoltageByPin('u', 'out') < start + 0.632 && samples < 100) {
      solver.step(DT);
      samples++;
    }
    const tau = 1 / (2 * Math.PI * 1000);
    expect(samples * DT).toBeGreaterThan(tau * 0.9);
    expect(samples * DT).toBeLessThan(tau * 1.2);
  });

  it('does not chatter: a clipped amplifier costs no more than a linear one', () => {
    const solver = inverting(3.0, 10e3, 100e3);
    for (let i = 0; i < 100; i++) solver.step(DT);
    const t0 = performance.now();
    for (let i = 0; i < 20000; i++) solver.step(DT);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
