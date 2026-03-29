import type { ComponentModel } from '../models/ComponentModel';
import type { ModelRegistry } from '../models/ModelRegistry';
import { solveLinearSystem } from './matrix';

export interface SerializedComponent {
  id: string;
  type: string;
  pins: Array<{ id: string; label: string; type: string }>;
  parameters: Record<string, number | string | boolean>;
}

export interface SerializedConnection {
  id: string;
  from: { componentId: string; pinId: string };
  to: { componentId: string; pinId: string };
}

const GMIN = 1e-12;
const MAX_NR_ITERATIONS = 15;
const NR_VTOL = 1e-4;

export class MNASolver {
  private registry: ModelRegistry;
  private subcycles = 1;
  private supplyVoltage = 0;

  // Pin-to-net mapping: "componentId::pinId" -> net ID
  private pinToNet = new Map<string, number>();
  // Net ID -> MNA node index (-1 for ground)
  private netToNode = new Map<number, number>();
  // Component models keyed by component ID
  private models = new Map<string, ComponentModel>();

  // Matrix dimensions and pre-allocated arrays
  private size = 0;
  private G: Float64Array[] = [];
  private b = new Float64Array(0);
  private x = new Float64Array(0);
  private xPrev = new Float64Array(0);     // previous NR iteration (for convergence check)
  private xSaved = new Float64Array(0);    // start-of-timestep snapshot (for NaN recovery)
  private M: Float64Array[] = [];

  // Built-in voltage source branches (for power components without registered models)
  private builtinVSources: Array<{ posNode: number; negNode: number; voltage: number; branchIdx: number }> = [];

  // Audio output state
  private audioOutputNode = -1;
  private dcBlockPrev = 0;
  private dcBlockOut = 0;
  private readonly dcBlockAlpha = 0.995;

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  setSubcycles(count: number): void {
    this.subcycles = Math.max(1, Math.min(8, Math.round(count)));
  }

  getSupplyVoltage(): number {
    return this.supplyVoltage;
  }

  loadCircuit(components: SerializedComponent[], connections: SerializedConnection[]): void {
    this.models.clear();
    this.pinToNet.clear();
    this.netToNode.clear();
    this.builtinVSources = [];
    this.audioOutputNode = -1;
    this.dcBlockPrev = 0;
    this.dcBlockOut = 0;

    // --- Union-Find for net building ---
    const parent = new Map<string, string>();

    const find = (key: string): string => {
      let root = key;
      while (parent.get(root) !== root) root = parent.get(root)!;
      // Path compression
      let current = key;
      while (current !== root) {
        const next = parent.get(current)!;
        parent.set(current, root);
        current = next;
      }
      return root;
    };

    const union = (a: string, b: string): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    };

    // Initialize each pin as its own set
    for (const comp of components) {
      for (const pin of comp.pins) {
        const key = `${comp.id}::${pin.id}`;
        parent.set(key, key);
      }
    }

    // Union connected pins
    for (const conn of connections) {
      const fromKey = `${conn.from.componentId}::${conn.from.pinId}`;
      const toKey = `${conn.to.componentId}::${conn.to.pinId}`;
      union(fromKey, toKey);
    }

    // Assign net IDs (one per unique root)
    const rootToNet = new Map<string, number>();
    let nextNet = 0;
    for (const comp of components) {
      for (const pin of comp.pins) {
        const key = `${comp.id}::${pin.id}`;
        const root = find(key);
        if (!rootToNet.has(root)) {
          rootToNet.set(root, nextNet++);
        }
        this.pinToNet.set(key, rootToNet.get(root)!);
      }
    }

    // --- Identify ground net ---
    let groundNet = -1;
    for (const comp of components) {
      for (const pin of comp.pins) {
        if (pin.type === 'ground') {
          const key = `${comp.id}::${pin.id}`;
          groundNet = this.pinToNet.get(key)!;
          break;
        }
      }
      if (groundNet >= 0) break;
    }

    // --- Identify power supply voltage ---
    for (const comp of components) {
      if (comp.type === 'power') {
        const voltage = Number(comp.parameters.voltage ?? 9);
        this.supplyVoltage = voltage;
        break;
      }
    }

    // --- Assign MNA node indices (ground net -> -1) ---
    const allNets = new Set(this.pinToNet.values());
    let nodeIdx = 0;
    for (const net of allNets) {
      if (net === groundNet) {
        this.netToNode.set(net, -1);
      } else {
        this.netToNode.set(net, nodeIdx++);
      }
    }
    const numExternalNodes = nodeIdx;

    // --- Create models and allocate internal nodes + branches ---
    let internalNodeStart = numExternalNodes;
    let branchStart = numExternalNodes; // will be updated after counting internal nodes

    // First pass: count internal nodes
    interface ModelEntry { comp: SerializedComponent; model: ComponentModel }
    const modelEntries: ModelEntry[] = [];

    for (const comp of components) {
      if (comp.type === 'ground') continue; // Ground is a topology marker only

      const model = this.registry.create(comp.type);
      if (model) {
        modelEntries.push({ comp, model });
        internalNodeStart += 0; // counted below
      } else if (comp.type === 'power') {
        // Built-in power source handling (until PowerSourceModel is registered)
        // Will add a branch variable for the voltage source
      }
      // Other unregistered types are silently ignored
    }

    // Count total internal nodes
    let totalInternalNodes = 0;
    for (const entry of modelEntries) {
      totalInternalNodes += entry.model.getInternalNodeCount();
    }

    // Recompute: branchStart comes after external + internal nodes
    branchStart = numExternalNodes + totalInternalNodes;

    // Count branches from models
    let totalBranches = 0;
    for (const entry of modelEntries) {
      totalBranches += entry.model.getBranchCount();
    }

    // Count built-in voltage source branches (for unregistered power components)
    let builtinBranches = 0;
    for (const comp of components) {
      if (comp.type === 'power' && !this.registry.has('power')) {
        builtinBranches++;
      }
    }

    this.size = numExternalNodes + totalInternalNodes + totalBranches + builtinBranches;

    // --- Initialize models ---
    let currentInternalStart = numExternalNodes;
    let currentBranchStart = branchStart;

    for (const entry of modelEntries) {
      const { comp, model } = entry;
      const pinNodes: number[] = [];
      for (const pin of comp.pins) {
        const net = this.pinToNet.get(`${comp.id}::${pin.id}`)!;
        pinNodes.push(this.netToNode.get(net)!);
      }

      const numParams: Record<string, number> = {};
      for (const [k, v] of Object.entries(comp.parameters)) {
        numParams[k] = Number(v);
      }

      model.init(pinNodes, currentInternalStart, currentBranchStart, numParams);
      currentInternalStart += model.getInternalNodeCount();
      currentBranchStart += model.getBranchCount();
      this.models.set(comp.id, model);
    }

    // --- Set up built-in voltage sources ---
    let builtinBranchIdx = currentBranchStart;
    for (const comp of components) {
      if (comp.type === 'power' && !this.registry.has('power')) {
        const posNet = this.pinToNet.get(`${comp.id}::${comp.pins[0].id}`)!;
        const negNet = this.pinToNet.get(`${comp.id}::${comp.pins[1].id}`)!;
        const posNode = this.netToNode.get(posNet)!;
        const negNode = this.netToNode.get(negNet)!;
        const voltage = Number(comp.parameters.voltage ?? 9);
        this.builtinVSources.push({ posNode, negNode, voltage, branchIdx: builtinBranchIdx });
        builtinBranchIdx++;
      }
    }

    // --- Identify audio output node ---
    for (const comp of components) {
      if (comp.type === 'audio-output') {
        const net = this.pinToNet.get(`${comp.id}::${comp.pins[0].id}`);
        if (net !== undefined) {
          const node = this.netToNode.get(net);
          if (node !== undefined && node >= 0) {
            this.audioOutputNode = node;
          }
        }
        break;
      }
    }

    // --- Pre-allocate matrices ---
    this.allocateMatrices();
  }

  private allocateMatrices(): void {
    const n = this.size;
    this.G = new Array(n);
    for (let i = 0; i < n; i++) {
      this.G[i] = new Float64Array(n);
    }
    this.b = new Float64Array(n);
    this.x = new Float64Array(n);
    this.xPrev = new Float64Array(n);
    this.xSaved = new Float64Array(n);
    this.M = new Array(n);
    for (let i = 0; i < n; i++) {
      this.M[i] = new Float64Array(n + 1);
    }
  }

  resetState(): void {
    this.x.fill(0);
    this.xPrev.fill(0);
    this.xSaved.fill(0);
    this.dcBlockPrev = 0;
    this.dcBlockOut = 0;
    for (const model of this.models.values()) {
      model.reset();
    }
  }

  step(dt: number): number {
    const subDt = dt / this.subcycles;
    let audioSample = 0;

    for (let sub = 0; sub < this.subcycles; sub++) {
      const converged = this.solveOneStep(subDt);

      // Only update model state if the solve was valid (no NaN)
      if (converged) {
        for (const model of this.models.values()) {
          model.postStep(this.x, subDt);
        }
      }

      // Capture audio on last subcycle
      if (sub === this.subcycles - 1) {
        audioSample = this.getAudioSample();
      }
    }

    return audioSample;
  }

  private solveOneStep(dt: number): boolean {
    const n = this.size;
    if (n === 0) return true;

    // Save start-of-timestep solution for NaN recovery
    this.xSaved.set(this.x);

    for (let iter = 0; iter < MAX_NR_ITERATIONS; iter++) {
      // Save previous NR iteration for convergence check
      this.xPrev.set(this.x);
      // Clear G and b
      for (let i = 0; i < n; i++) {
        this.G[i].fill(0);
      }
      this.b.fill(0);

      // Stamp all registered models
      for (const model of this.models.values()) {
        model.stamp(this.G, this.b, this.x, dt);
      }

      // Stamp built-in voltage sources
      for (const vs of this.builtinVSources) {
        const { posNode, negNode, voltage, branchIdx } = vs;
        if (posNode >= 0) {
          this.G[posNode][branchIdx] += 1;
          this.G[branchIdx][posNode] += 1;
        }
        if (negNode >= 0) {
          this.G[negNode][branchIdx] -= 1;
          this.G[branchIdx][negNode] -= 1;
        }
        this.b[branchIdx] = voltage;
      }

      // Add Gmin to node diagonals for numerical stability
      for (let i = 0; i < n; i++) {
        this.G[i][i] += GMIN;
      }

      // Solve Gx = b
      const result = solveLinearSystem(this.G, this.b, n, this.M);

      // Check for NaN/Infinity — if found, restore previous state and skip timestep
      let hadNaN = false;
      for (let i = 0; i < n; i++) {
        if (!isFinite(result[i])) {
          hadNaN = true;
          break;
        }
      }
      if (hadNaN) {
        this.x.set(this.xSaved);
        return false; // signal caller to skip postStep
      }

      this.x.set(result);

      // Check convergence
      let maxErr = 0;
      for (const model of this.models.values()) {
        const err = model.convergenceError(this.xPrev, this.x);
        if (err > maxErr) maxErr = err;
      }

      let maxDv = 0;
      for (let i = 0; i < n; i++) {
        const dv = Math.abs(this.x[i] - this.xPrev[i]);
        if (dv > maxDv) maxDv = dv;
      }

      if (maxErr < NR_VTOL && maxDv < NR_VTOL) break;
    }
    return true;
  }

  private getAudioSample(): number {
    if (this.audioOutputNode < 0 || this.audioOutputNode >= this.x.length) return 0;
    const raw = this.x[this.audioOutputNode];

    // DC blocker: y[n] = x[n] - x[n-1] + alpha * y[n-1]
    const filtered = raw - this.dcBlockPrev + this.dcBlockAlpha * this.dcBlockOut;
    this.dcBlockPrev = raw;
    this.dcBlockOut = filtered;

    // Normalize to [-1, 1]
    const v = this.supplyVoltage || 9;
    return Math.max(-1, Math.min(1, filtered / (v * 0.5)));
  }

  getNodeVoltageByPin(componentId: string, pinId: string): number {
    const net = this.pinToNet.get(`${componentId}::${pinId}`);
    if (net === undefined) return 0;
    const node = this.netToNode.get(net);
    if (node === undefined || node < 0) return 0;
    if (node >= this.x.length) return 0;
    return this.x[node];
  }

  getNodeVoltage(node: number): number {
    if (node < 0 || node >= this.x.length) return 0;
    return this.x[node];
  }

  getModel(componentId: string): ComponentModel | undefined {
    return this.models.get(componentId);
  }

  getSolutionVector(): Float64Array {
    return this.x;
  }
}
