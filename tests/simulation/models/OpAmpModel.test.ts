import { describe, it, expect } from 'vitest';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';

// Pins: IN-(0), IN+(1), V-(2), OUT(3), V+(4); gain node is internal (5)
const GAIN = 5;
const DT = 1 / 192000;
function makeModel() {
  const m = new OpAmpModel(OPAMP_LM741_PARAMS);
  m.init([0, 1, 2, 3, 4], GAIN, 0, {});
  return m;
}
const stamp = (m: OpAmpModel) => {
  const G = Array.from({ length: 6 }, () => new Float64Array(6));
  m.stampMatrix(G, DT, false);
  return G;
};
const { GBW, Cc, Aol, slewRate, headroom, Rout } = OPAMP_LM741_PARAMS;
const gm = 2 * Math.PI * GBW * Cc;
const vClip = (slewRate * Cc) / gm;
// x = [IN-, IN+, V-, OUT, V+, gain]
const state = (inm: number, inp: number, gain: number) => Float64Array.from([inm, inp, 0, gain, 9, gain]);

describe('OpAmpModel', () => {
  it('has one internal node (the gain stage) and no branches', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    expect(m.getInternalNodeCount()).toBe(1);
    expect(m.getBranchCount()).toBe(0);
    expect(m.nonlinear).toBe(false);
  });

  it('stamps an input stage that raises the gain node when IN+ is above IN-', () => {
    const G = stamp(makeModel());
    // Row = current leaving the gain node: IN+ pushes current in (negative)
    expect(G[GAIN][1]).toBeCloseTo(-gm, 12);
    expect(G[GAIN][0]).toBeCloseTo(gm, 12);
    // DC open-loop gain = gm / (gain-node conductance to ground, without the capacitor)
    expect(gm / (G[GAIN][GAIN] - Cc / DT)).toBeCloseTo(Aol, -1);
  });

  it('buffers the gain node to the output through Rout without loading it', () => {
    const G = stamp(makeModel());
    expect(G[3][3]).toBeCloseTo(1 / Rout, 9);
    expect(G[3][GAIN]).toBeCloseTo(-1 / Rout, 9);
    expect(G[GAIN][3]).toBe(0);
  });

  it('enters slew limiting where the input stage current saturates', () => {
    const m = makeModel();
    const before = m.getDiscreteState();
    const f = m.findEvent(state(0, 0, 4), state(0, 2 * vClip, 4));
    expect(f).toBeCloseTo(0.5, 4);
    m.applyEvent(f);
    expect(m.getDiscreteState()).not.toBe(before);

    // Slewing: the input no longer steers the gain node; a fixed current does
    const G = stamp(m);
    expect(G[GAIN][1]).toBe(0);
    expect(G[GAIN][0]).toBe(0);
    const b = new Float64Array(6);
    m.stampRhs(b, DT, false);
    expect(b[GAIN]).toBeCloseTo(slewRate * Cc, 12);
  });

  it('leaves slew limiting when the inputs come back together', () => {
    const m = makeModel();
    const linear = m.getDiscreteState();
    m.applyEvent(m.findEvent(state(0, 0, 4), state(0, 2 * vClip, 4)));
    const f = m.findEvent(state(0, 2 * vClip, 4), state(0, 0, 4));
    expect(f).toBeCloseTo(0.5, 4);
    m.applyEvent(f);
    expect(m.getDiscreteState()).toBe(linear);
  });

  it('clamps the gain node one headroom below the positive rail', () => {
    const m = makeModel();
    const rail = 9 - headroom;
    const f = m.findEvent(state(0, 0, rail - 0.1), state(0, 0, rail + 0.1));
    expect(f).toBeCloseTo(0.5, 4);
    const before = m.getDiscreteState();
    m.applyEvent(f);
    expect(m.getDiscreteState()).not.toBe(before);
    // Released again when it comes back inside
    const back = m.findEvent(state(0, 0, rail + 0.1), state(0, 0, rail - 0.1));
    expect(back).toBeCloseTo(0.5, 4);
    m.applyEvent(back);
    expect(m.getDiscreteState()).toBe(before);
  });

  it('clamps the gain node one headroom above the negative rail', () => {
    const m = makeModel();
    const f = m.findEvent(state(0, 0, headroom + 0.1), state(0, 0, headroom - 0.1));
    expect(f).toBeCloseTo(0.5, 4);
  });

  it('reports no event while operating linearly inside the rails', () => {
    const m = makeModel();
    expect(m.findEvent(state(4.5, 4.5001, 4), state(4.5, 4.4999, 5))).toBe(Infinity);
  });
});
