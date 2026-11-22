import { describe, it, expect } from 'vitest';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

// Gate 1: input = node 0, output = node 1. VDD = node 2 (9V), VSS = ground.
function makeModel(pinConnected?: boolean[]) {
  const m = new SchmittTriggerModel();
  const pins = new Array(14).fill(-1);
  pins[0] = 0; pins[6] = 1; pins[12] = 2; pins[13] = -1;
  m.init(pins, 0, 0, {}, pinConnected);
  return m;
}
const emptyG = () => Array.from({ length: 3 }, () => new Float64Array(3));
const state = (vin: number, vout = 9) => Float64Array.from([vin, vout, 9]);
const Gon = 1 / 280;

describe('SchmittTriggerModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new SchmittTriggerModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps output conductance to Vdd when output is high', () => {
    const m = makeModel();
    const G = emptyG();
    m.stampMatrix(G, 1 / 48000, false);
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    expect(G[1][2]).toBeCloseTo(-Gon, 4);
    expect(G[2][1]).toBeCloseTo(-Gon, 4);
  });

  it('reports no event while the input stays below VT+', () => {
    const m = makeModel();
    expect(m.findEvent(state(1.0), state(5.2))).toBe(Infinity);
  });

  it('locates the instant the input crosses VT+ within a step', () => {
    const m = makeModel();
    // VT+ = 0.59 × 9 = 5.31V. Input ramps 5.21 → 5.41, so it crosses halfway.
    const f = m.findEvent(state(5.21), state(5.41));
    expect(f).toBeCloseTo(0.5, 6);
  });

  it('flips only when the event is applied, and changes its discrete state', () => {
    const m = makeModel();
    const before = m.getDiscreteState();
    const f = m.findEvent(state(5.21), state(5.41));
    expect(m.getGateState(0)).toBe(true);

    m.applyEvent(f);
    expect(m.getGateState(0)).toBe(false);
    expect(m.getDiscreteState()).not.toBe(before);

    // Output is now pulled to VSS (ground), not VDD
    const G = emptyG();
    m.stampMatrix(G, 1 / 48000, false);
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    expect(Math.abs(G[1][2])).toBeLessThan(1e-6);
  });

  it('does not apply an event that lies after the requested instant', () => {
    const m = makeModel();
    const f = m.findEvent(state(5.21), state(5.41));
    m.applyEvent(f - 0.1);
    expect(m.getGateState(0)).toBe(true);
  });

  it('has hysteresis: after going low it waits for VT− to go high again', () => {
    const m = makeModel();
    m.applyEvent(m.findEvent(state(5.21), state(5.41)));
    // Still above VT− = 0.40 × 9 = 3.6V: nothing happens
    expect(m.findEvent(state(5.3, 0), state(3.7, 0))).toBe(Infinity);
    // Falls 3.7 → 3.5: crosses VT− halfway
    expect(m.findEvent(state(3.7, 0), state(3.5, 0))).toBeCloseTo(0.5, 6);
  });

  it('reports an immediate event if the input is already past the threshold', () => {
    const m = makeModel();
    expect(m.findEvent(state(6.0), state(6.0))).toBe(0);
  });

  it('ignores gates whose output is not connected to anything', () => {
    const connected = new Array(14).fill(true);
    connected[6] = false;
    const m = makeModel(connected);
    expect(m.findEvent(state(5.21), state(5.41))).toBe(Infinity);
  });

  it('engages the output protection diode only beyond the rail', () => {
    const m = makeModel();
    // Output pushed from 9.2V to 9.4V: the diode turns on at VDD + 0.3V
    const f = m.findEvent(state(0, 9.2), state(0, 9.4));
    expect(f).toBeCloseTo(0.5, 4);
    m.applyEvent(f);

    const G = emptyG();
    const b = new Float64Array(3);
    m.stampMatrix(G, 1 / 48000, false);
    m.stampRhs(b, 1 / 48000, false);
    expect(G[1][1]).toBeCloseTo(Gon + 0.1, 4);
    // Diode current is zero exactly at the switching point (continuous element)
    const iDiode = 0.1 * (9.3 - 9) - b[1];
    expect(iDiode).toBeCloseTo(0, 9);
  });

  it('reset returns every gate to its initial state', () => {
    const m = makeModel();
    m.applyEvent(m.findEvent(state(5.21), state(5.41)));
    m.reset();
    expect(m.getGateState(0)).toBe(true);
  });
});
