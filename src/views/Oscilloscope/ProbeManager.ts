import type { ComponentId, PinId } from '@/types/circuit';

const CHANNEL_COLORS = ['#00FF00', '#FFFF00', '#00FFFF', '#FF00FF'] as const;
const MAX_PROBES = 4;
const MAX_SAMPLES = 10000;

export interface Probe {
  componentId: ComponentId;
  pinId: PinId;
  color: string;
  samples: number[];
}

export class ProbeManager {
  private probes: Probe[] = [];

  addProbe(componentId: ComponentId, pinId: PinId): void {
    if (this.probes.length >= MAX_PROBES) return;
    this.probes.push({
      componentId,
      pinId,
      color: CHANNEL_COLORS[this.probes.length],
      samples: [],
    });
  }

  removeProbe(index: number): void {
    if (index < 0 || index >= this.probes.length) return;
    this.probes.splice(index, 1);
    // Reassign colors in order
    this.probes.forEach((probe, i) => {
      probe.color = CHANNEL_COLORS[i];
    });
  }

  getProbes(): Probe[] {
    return [...this.probes];
  }

  pushSample(probeIndex: number, voltage: number): void {
    const probe = this.probes[probeIndex];
    if (!probe) return;
    probe.samples.push(voltage);
    // Only trim when significantly over limit to amortize cost
    if (probe.samples.length > MAX_SAMPLES * 1.5) {
      probe.samples = probe.samples.slice(-MAX_SAMPLES);
    }
  }

  getSamples(probeIndex: number): number[] {
    const probe = this.probes[probeIndex];
    return probe ? probe.samples : [];
  }

  clear(): void {
    this.probes = [];
  }
}
