import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProbeManager } from '@/views/Oscilloscope/ProbeManager';
import type { ComponentId, PinId } from '@/types/circuit';

const cid = (s: string) => s as ComponentId;
const pid = (s: string) => s as PinId;

describe('ProbeManager', () => {
  it('addProbe adds a probe', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    expect(manager.getProbes()).toHaveLength(1);
    expect(manager.getProbes()[0].componentId).toBe('c1');
    expect(manager.getProbes()[0].pinId).toBe('p1');
  });

  it('limits to 4 probes', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    manager.addProbe(cid('c2'), pid('p2'));
    manager.addProbe(cid('c3'), pid('p3'));
    manager.addProbe(cid('c4'), pid('p4'));
    manager.addProbe(cid('c5'), pid('p5'));
    expect(manager.getProbes()).toHaveLength(4);
  });

  it('removeProbe removes correct probe', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    manager.addProbe(cid('c2'), pid('p2'));
    manager.addProbe(cid('c3'), pid('p3'));
    manager.removeProbe(1);
    const probes = manager.getProbes();
    expect(probes).toHaveLength(2);
    expect(probes[0].componentId).toBe('c1');
    expect(probes[1].componentId).toBe('c3');
  });

  it('stores samples in rolling buffer', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    manager.pushSample(0, 3.3);
    manager.pushSample(0, 1.5);
    manager.pushSample(0, 2.7);
    expect(manager.getSamples(0)).toEqual([3.3, 1.5, 2.7]);
  });

  it('caps buffer at 10000 samples', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    // Push 15001 samples to trigger trim (threshold is MAX_SAMPLES * 1.5 = 15000)
    for (let i = 0; i < 15001; i++) {
      manager.pushSample(0, i);
    }
    const samples = manager.getSamples(0);
    expect(samples).toHaveLength(10000);
    // Should have kept the last 10000 samples
    expect(samples[0]).toBe(5001);
    expect(samples[9999]).toBe(15000);
  });

  it('assigns correct colors to channels', () => {
    const manager = new ProbeManager();
    const colors = ['#00FF00', '#FFFF00', '#00FFFF', '#FF00FF'];
    manager.addProbe(cid('c1'), pid('p1'));
    manager.addProbe(cid('c2'), pid('p2'));
    manager.addProbe(cid('c3'), pid('p3'));
    manager.addProbe(cid('c4'), pid('p4'));
    const probes = manager.getProbes();
    probes.forEach((probe, i) => {
      expect(probe.color).toBe(colors[i]);
    });
  });

  it('reassigns colors after removal', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    manager.addProbe(cid('c2'), pid('p2'));
    manager.addProbe(cid('c3'), pid('p3'));
    manager.removeProbe(0);
    const probes = manager.getProbes();
    // After removal, remaining probes get reassigned colors in order
    expect(probes[0].color).toBe('#00FF00');
    expect(probes[1].color).toBe('#FFFF00');
  });

  it('clear removes all probes', () => {
    const manager = new ProbeManager();
    manager.addProbe(cid('c1'), pid('p1'));
    manager.addProbe(cid('c2'), pid('p2'));
    manager.clear();
    expect(manager.getProbes()).toHaveLength(0);
  });
});
