import type { Connection, ComponentId, PinId } from '@/types/circuit';

export interface NetPin {
  componentId: ComponentId;
  pinId: PinId;
}

export interface Net {
  id: number;
  pins: NetPin[];
}

export class NetAnalyzer {
  private parent: Map<string, string>;
  private rank: Map<string, number>;
  private nets: Net[] | null = null;
  private netByRootKey: Map<string, Net> | null = null;

  constructor(private connections: Connection[]) {
    this.parent = new Map();
    this.rank = new Map();
    this.build();
  }

  private pinKey(componentId: string, pinId: string): string {
    return `${componentId}::${pinId}`;
  }

  private find(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
    let root = key;
    while (this.parent.get(root) !== root) {
      this.parent.set(root, this.parent.get(this.parent.get(root)!)!);
      root = this.parent.get(root)!;
    }
    return root;
  }

  private union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;

    const rankA = this.rank.get(rootA)!;
    const rankB = this.rank.get(rootB)!;

    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  private build(): void {
    for (const conn of this.connections) {
      const fromKey = this.pinKey(conn.from.componentId, conn.from.pinId);
      const toKey = this.pinKey(conn.to.componentId, conn.to.pinId);
      this.union(fromKey, toKey);
    }
  }

  getNets(): Net[] {
    if (this.nets !== null) return this.nets;

    const groups = new Map<string, NetPin[]>();

    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      const [componentId, pinId] = key.split('::') as [ComponentId, PinId];
      groups.get(root)!.push({ componentId, pinId });
    }

    this.netByRootKey = new Map();
    this.nets = [];

    let index = 0;
    for (const [root, pins] of groups) {
      const net: Net = { id: index++, pins };
      this.nets.push(net);
      this.netByRootKey.set(root, net);
    }

    return this.nets;
  }

  getNetForPin(componentId: ComponentId, pinId: PinId): Net | undefined {
    const key = this.pinKey(componentId, pinId);
    if (!this.parent.has(key)) return undefined;

    // Ensure nets and lookup table are built
    this.getNets();

    const root = this.find(key);
    return this.netByRootKey!.get(root);
  }
}
