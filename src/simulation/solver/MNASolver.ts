import type { ComponentModel } from '../models/ComponentModel';
import type { ModelRegistry } from '../models/ModelRegistry';
import { luFactor, luSolve } from './matrix';
import { OutputSampler } from './OutputSampler';

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

/**
 * Solver steps per audio sample. Two is enough: measured pitch and alias
 * levels are the same at 2 and at 4, and nonlinear circuits agree to four
 * digits (they drift by about 1% at 1).
 */
const DEFAULT_OVERSAMPLING = 2;
/**
 * Resolution of the output sampler, in cells per audio sample. It is at least
 * this fine whatever the step count: the solver's output is piecewise linear
 * with edges at their exact instants, and the sampler integrates each piece
 * exactly, so anti-aliasing quality does not depend on taking small steps.
 */
const MIN_OUTPUT_CELLS = 4;
/**
 * Length of the backward-Euler restart step taken after a discontinuity, as a
 * fraction of the normal step. Short enough to be "instantaneous", long enough
 * to keep the companion conductances well scaled.
 */
const RESTART_FRACTION = 1 / 1024;
/**
 * Events located at their exact instant per audio sample. Beyond this (a gate
 * wired straight back to its own input, say) events are applied at step
 * boundaries instead, which bounds the work per sample.
 */
const MAX_LOCATED_EVENTS_PER_SAMPLE = 16;
const MAX_CACHE_ENTRIES = 1024;
/** Passes allowed for gates and clamps to settle while finding the DC operating point. */
const DC_EVENT_PASSES = 24;
/** Corner of the output DC blocker (the AC coupling of whatever the jack feeds). */
const DC_BLOCK_HZ = 10;
const CACHE_BUDGET_DOUBLES = 4_000_000;
/** Resistance of a bend held between two points when none is given: a jumper wire. */
const BEND_OHMS = 1;

/**
 * Inverse system matrices for one discrete state of the circuit (which gates
 * are high, which clamps conduct), one per integration method. A circuit
 * revisits the same few states over and over, so after warm-up a step costs
 * one matrix–vector product and no factorization at all.
 */
interface MatrixEntry {
  /** Each event model's discrete state: whole numbers, which may be wider than 32 bits. */
  state: Float64Array;
  /** Hash of `state`, so a lookup compares one number per entry before it compares states. */
  hash: number;
  /** [trapezoidal @ h, backward Euler @ restart step], stored column-major. */
  inv: [Float64Array, Float64Array];
  /** Each inverse restricted to the nonlinear nodes (k×k), for the reduced Newton solve. */
  K: [Float64Array, Float64Array];
  valid: [boolean, boolean];
  lastUsed: number;
}

export class MNASolver {
  private registry: ModelRegistry;
  private oversampling = DEFAULT_OVERSAMPLING;
  /** Output-sampler cells covered by one full solver step. */
  private cellsPerStep = Math.max(MIN_OUTPUT_CELLS, DEFAULT_OVERSAMPLING) / DEFAULT_OVERSAMPLING;
  private supplyVoltage = 0;

  // Pin-to-net mapping: "componentId::pinId" -> net ID
  private pinToNet = new Map<string, number>();
  // Net ID -> MNA node index (-1 for ground)
  private netToNode = new Map<number, number>();
  // Component models keyed by component ID
  private models = new Map<string, ComponentModel>();
  // Flat views of the models for the hot loops
  private modelList: ComponentModel[] = [];
  private rhsModels: ComponentModel[] = [];
  private stepModels: ComponentModel[] = [];
  private nonlinearModels: ComponentModel[] = [];
  private eventModels: ComponentModel[] = [];
  private syncModels: ComponentModel[] = [];

  // System size and pre-allocated work arrays
  private size = 0;
  private work = new Float64Array(0);        // scratch matrix (flat, row-major), kept zeroed between uses
  private workRows: Float64Array[] = [];     // row views into `work` for stamping
  private lu = new Float64Array(0);          // factorization scratch
  private luPiv = new Int32Array(0);
  private col = new Float64Array(0);
  private unit = new Float64Array(0);
  private b = new Float64Array(0);
  private x = new Float64Array(0);           // accepted solution at the current time
  private xNew = new Float64Array(0);        // candidate solution for the step in progress

  // Newton-Raphson, reduced to the nodes that nonlinear stamps touch
  private nlNodes = new Int32Array(0);
  private nlG = new Float64Array(0);         // linearized conductances (k×k)
  private nlM = new Float64Array(0);         // I + K·G (k×k)
  private nlPiv = new Int32Array(0);
  private nlB = new Float64Array(0);         // linearized source currents
  private nlRhs = new Float64Array(0);
  private nlX = new Float64Array(0);
  private nlY0 = new Float64Array(0);
  private bScratch = new Float64Array(0);    // full-size RHS scratch for stamping, kept zeroed
  private xIter = new Float64Array(0);       // full-size Newton iterate (only nlNodes are meaningful)
  private xIterNext = new Float64Array(0);

  // Time stepping
  private sampleDt = 0;                      // audio sample period the steps were sized for
  private h = 0;                             // normal step
  private hRestart = 0;                      // backward-Euler restart step
  private needsRestart = true;
  private locatedEvents = 0;

  // Factorization cache, keyed by the models' discrete states
  private cache: MatrixEntry[] = [];
  private maxCacheEntries = MAX_CACHE_ENTRIES;
  private entry: MatrixEntry | null = null;
  private stateDirty = true;
  private curState = new Float64Array(0);
  private useCounter = 0;

  // Built-in voltage source branches (for power components without registered models)
  private builtinVSources: Array<{ posNode: number; negNode: number; voltage: number; branchIdx: number }> = [];

  // Audio output + probes
  /**
   * Where the sound is taken from: the voltage from one node to another, for
   * each part that is heard (a jack, a speaker). They are added together.
   * `trim` is a level control of that part's own.
   */
  private audioTaps: Array<{ positive: number; negative: number; trim: { getGain(): number } | null }> = [];
  private sampler = new OutputSampler(Math.max(MIN_OUTPUT_CELLS, DEFAULT_OVERSAMPLING));
  private probeNodes: number[] = [];
  private probePins: Array<{ componentId: string; pinId: string }> = [];
  private audioPrev = 0;
  private tapPrev = new Float64Array(0);
  private tapNow = new Float64Array(0);
  private dcBlockPrev = 0;
  private dcBlockOut = 0;
  private dcBlockAlpha = 0.999;
  /**
   * Input trim of the (first) audio jack: the recording level of the whole
   * mix, applied after the DC blocker so that turning it cannot click.
   */
  private audioTrim: { getGain(): number } | null = null;

  // A bend: a jumper held between two nodes of the running circuit
  private bend: { a: number; b: number; g: number } | null = null;
  /** Nets that are only an unused pin of a chip: they have no node, and nothing can be bent to them. */
  private floatingNets = new Set<number>();

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  /** Internal steps per audio sample (1–8). Higher is cleaner and costs proportionally more. */
  setOversampling(count: number): void {
    const next = Math.max(1, Math.min(8, Math.round(count)));
    if (next === this.oversampling) return;
    this.oversampling = next;
    this.sampleDt = 0; // step sizes are re-derived on the next step()
    const cells = Math.max(MIN_OUTPUT_CELLS, next);
    this.cellsPerStep = cells / next;
    this.sampler.configure(cells);
    this.syncTaps();
  }

  getOversampling(): number {
    return this.oversampling;
  }

  getSupplyVoltage(): number {
    return this.supplyVoltage;
  }

  loadCircuit(components: SerializedComponent[], connections: SerializedConnection[]): void {
    this.models.clear();
    this.pinToNet.clear();
    this.netToNode.clear();
    this.builtinVSources = [];
    this.audioTaps = [];
    this.audioTrim = null;
    this.bend = null; // a jumper does not survive the circuit being rebuilt

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

    // Every ground symbol is the same node, wired together or not — that is
    // what the symbol means on a schematic
    let firstGround: string | null = null;
    for (const comp of components) {
      if (comp.type !== 'ground' || comp.pins.length === 0) continue;
      const key = `${comp.id}::${comp.pins[0].id}`;
      if (firstGround === null) firstGround = key;
      else union(firstGround, key);
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

    // --- Identify ground net: a ground symbol if there is one, otherwise any ground-type pin ---
    let groundNet = firstGround !== null ? this.pinToNet.get(firstGround)! : -1;
    for (const comp of components) {
      if (groundNet >= 0) break;
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

    // --- Create models ---
    interface ModelEntry { comp: SerializedComponent; model: ComponentModel }
    const modelEntries: ModelEntry[] = [];
    for (const comp of components) {
      if (comp.type === 'ground') continue; // Ground is a topology marker only
      const model = this.registry.create(comp.type);
      if (model) modelEntries.push({ comp, model });
      // Unregistered types are ignored (except 'power', handled as a built-in source below)
    }

    // A pin is "connected" if anything else shares its net
    const netPinCount = new Map<number, number>();
    for (const net of this.pinToNet.values()) {
      netPinCount.set(net, (netPinCount.get(net) ?? 0) + 1);
    }

    // Unconnected pins of parts that ignore them (unused gates of an IC) need
    // no unknown of their own
    const unusedNets = new Set<number>();
    for (const { comp, model } of modelEntries) {
      if (!model.ignoresUnconnectedPins) continue;
      for (const pin of comp.pins) {
        const net = this.pinToNet.get(`${comp.id}::${pin.id}`)!;
        if (netPinCount.get(net) === 1) unusedNets.add(net);
      }
    }

    this.floatingNets = unusedNets;

    // --- Assign MNA node indices (ground net -> -1) ---
    const allNets = new Set(this.pinToNet.values());
    let nodeIdx = 0;
    for (const net of allNets) {
      if (net === groundNet || unusedNets.has(net)) {
        this.netToNode.set(net, -1);
      } else {
        this.netToNode.set(net, nodeIdx++);
      }
    }
    const numExternalNodes = nodeIdx;

    // --- Allocate internal nodes + branches ---
    let branchStart = numExternalNodes; // will be updated after counting internal nodes

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
      const pinConnected: boolean[] = [];
      for (const pin of comp.pins) {
        const net = this.pinToNet.get(`${comp.id}::${pin.id}`)!;
        pinNodes.push(this.netToNode.get(net)!);
        pinConnected.push((netPinCount.get(net) ?? 0) > 1);
      }

      const numParams: Record<string, number> = {};
      for (const [k, v] of Object.entries(comp.parameters)) {
        numParams[k] = Number(v);
      }

      model.init(pinNodes, currentInternalStart, currentBranchStart, numParams, pinConnected);
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

    // --- Where the sound is taken from ---
    for (const comp of components) {
      const model = this.models.get(comp.id) as Partial<{
        audioTap(): { positive: number; negative: number };
        getGain(): number;
      }> | undefined;
      if (!model || typeof model.audioTap !== 'function') continue;
      const { positive, negative } = model.audioTap();
      if (positive < 0 && negative < 0) continue; // both ends on ground: silent
      let trim = typeof model.getGain === 'function' ? model as { getGain(): number } : null;
      if (trim && !this.audioTrim) {
        this.audioTrim = trim; // applied to the mix, after the DC blocker
        trim = null;
      }
      this.audioTaps.push({ positive, negative, trim });
    }

    // --- Flat model lists for the hot loops ---
    this.modelList = [...this.models.values()];
    this.rhsModels = this.modelList.filter(m => m.stampRhs);
    this.stepModels = this.modelList.filter(m => m.postStep);
    this.nonlinearModels = this.modelList.filter(m => m.nonlinear && m.stampNonlinear && m.getNonlinearNodes);
    this.eventModels = this.modelList.filter(m => m.findEvent && m.applyEvent && m.getDiscreteState);
    this.syncModels = this.modelList.filter(m => m.syncState);

    // --- Pre-allocate matrices ---
    this.allocateMatrices();
    this.resolveProbes();
    this.initializeState();
  }

  private allocateMatrices(): void {
    const n = this.size;
    this.work = new Float64Array(n * n);
    this.workRows = new Array(n);
    for (let i = 0; i < n; i++) {
      this.workRows[i] = this.work.subarray(i * n, (i + 1) * n);
    }
    this.lu = new Float64Array(n * n);
    this.luPiv = new Int32Array(n);
    this.col = new Float64Array(n);
    this.unit = new Float64Array(n);
    this.b = new Float64Array(n);
    this.x = new Float64Array(n);
    this.xNew = new Float64Array(n);

    // Nodes touched by nonlinear stamps (ground excluded)
    const nodes = new Set<number>();
    for (const m of this.nonlinearModels) {
      for (const node of m.getNonlinearNodes!()) {
        if (node >= 0) nodes.add(node);
      }
    }
    const k = nodes.size;
    this.nlNodes = Int32Array.from([...nodes].sort((p, q) => p - q));
    this.nlG = new Float64Array(k * k);
    this.nlM = new Float64Array(k * k);
    this.nlPiv = new Int32Array(k);
    this.nlB = new Float64Array(k);
    this.nlRhs = new Float64Array(k);
    this.nlX = new Float64Array(k);
    this.nlY0 = new Float64Array(n);
    this.bScratch = new Float64Array(n);
    this.xIter = new Float64Array(n);
    this.xIterNext = new Float64Array(n);

    this.curState = new Float64Array(this.eventModels.length);
    this.cache = [];
    this.maxCacheEntries = Math.max(4, Math.min(MAX_CACHE_ENTRIES,
      Math.floor(CACHE_BUDGET_DOUBLES / Math.max(1, 2 * n * n))));
    this.entry = null;
    this.stateDirty = true;
    this.needsRestart = true;
    this.locatedEvents = 0;
  }

  /** Put the circuit back to how it starts when loaded. */
  resetState(): void {
    this.initializeState();
  }

  /**
   * Start the circuit from its DC operating point, as SPICE does before a
   * transient run: every capacitor begins charged to the voltage the rest of
   * the circuit holds it at, instead of empty. Without this a bias network
   * with a large capacitor (220 µF on a 50 kΩ divider is 11 seconds) would
   * have to charge up before the circuit made a sound.
   *
   * It is an ordinary backward-Euler solve with an infinite time step, which
   * makes every capacitor an open circuit — no separate code path.
   */
  private initializeState(): void {
    this.x.fill(0);
    this.xNew.fill(0);
    for (const model of this.modelList) model.reset();
    this.stateDirty = true;

    if (this.size > 0) {
      const eventModels = this.eventModels;
      let ok = true;
      for (let pass = 0; pass < DC_EVENT_PASSES && ok; pass++) {
        this.invalidateMatrices();
        ok = this.solve(Infinity, true);
        if (!ok) break;
        const t = this.x; this.x = this.xNew; this.xNew = t;
        for (let i = 0; i < this.syncModels.length; i++) this.syncModels[i].syncState!(this.x);

        // Let gates, clamps and limiters settle into a state consistent with
        // that solution. A free-running oscillator never does, which is fine:
        // it simply starts from whichever half-cycle the last pass left it in.
        let changed = false;
        for (let i = 0; i < eventModels.length; i++) {
          if (eventModels[i].findEvent!(this.x, this.x) <= 0) changed = true;
        }
        if (!changed) break;
        for (let i = 0; i < eventModels.length; i++) eventModels[i].applyEvent!(0);
        this.stateDirty = true;
      }
      if (!ok) {
        // No usable operating point: fall back to starting from rest
        this.x.fill(0);
        for (const model of this.modelList) model.reset();
        this.stateDirty = true;
      }
    }
    this.xNew.set(this.x);
    this.invalidateMatrices();

    this.audioPrev = this.audioLevel(this.x);
    this.dcBlockPrev = this.audioPrev;
    this.dcBlockOut = 0;
    for (let i = 0; i < this.probeNodes.length; i++) {
      const node = this.probeNodes[i];
      this.tapPrev[i] = node >= 0 && node < this.x.length ? this.x[node] : 0;
    }
    this.sampler.prime(this.audioPrev, this.tapPrev);
    this.needsRestart = true;
    this.locatedEvents = 0;
  }

  /** Change a live parameter (pot position, switch state) on a component's model. */
  updateParam(componentId: string, key: string, value: number): void {
    const model = this.models.get(componentId) as (ComponentModel & {
      updateParam?: (key: string, value: number) => void;
    }) | undefined;
    if (!model || typeof model.updateParam !== 'function') return;
    model.updateParam(key, value);
    this.invalidateMatrices();
  }

  /**
   * Hold a jumper between two pins of the running circuit, or let go of it
   * (pass null). It is a resistor like any other, stamped into the same
   * matrix; what is different is that it can be moved from net to net
   * without the circuit starting again, so a bend can be heard as it is made.
   *
   * Returns whether anything is now connected: not when either pin is
   * unknown, both are on the same net, or one is an unused pin of a chip
   * (which has no node to connect to).
   */
  setBend(
    from: { componentId: string; pinId: string } | null,
    to: { componentId: string; pinId: string } | null,
    ohms = BEND_OHMS,
  ): boolean {
    let next: { a: number; b: number; g: number } | null = null;
    if (from && to) {
      const a = this.nodeOfPin(from), b = this.nodeOfPin(to);
      if (a !== undefined && b !== undefined && a !== b) {
        next = { a, b, g: 1 / Math.max(Number.isFinite(ohms) ? ohms : BEND_OHMS, 0.01) };
      }
    }
    const same = next === this.bend
      || (next !== null && this.bend !== null && next.a === this.bend.a && next.b === this.bend.b && next.g === this.bend.g);
    if (!same) {
      this.bend = next;
      this.invalidateMatrices();
    }
    return next !== null;
  }

  /** The node a pin is on (-1 for ground); undefined if it is unknown or has none. */
  private nodeOfPin(pin: { componentId: string; pinId: string }): number | undefined {
    const net = this.pinToNet.get(`${pin.componentId}::${pin.pinId}`);
    if (net === undefined || this.floatingNets.has(net)) return undefined;
    return this.netToNode.get(net);
  }

  /** Forget cached factorizations (a parameter changed) and restart integration cleanly. */
  private invalidateMatrices(): void {
    for (const e of this.cache) {
      e.valid[0] = false;
      e.valid[1] = false;
    }
    this.needsRestart = true;
  }

  // ---------------------------------------------------------------------------
  // Probes
  // ---------------------------------------------------------------------------

  /** Nodes to sample alongside the audio output (oscilloscope probes). */
  setProbes(probes: Array<{ componentId: string; pinId: string }>): void {
    this.probePins = probes.map(p => ({ componentId: p.componentId, pinId: p.pinId }));
    this.resolveProbes();
  }

  /** Voltage at probe `index` for the audio sample most recently returned by step(). */
  getProbeSample(index: number): number {
    return index < this.probeNodes.length ? this.sampler.tapValue(index) : 0;
  }

  private resolveProbes(): void {
    this.probeNodes = this.probePins.map(p => {
      const net = this.pinToNet.get(`${p.componentId}::${p.pinId}`);
      if (net === undefined) return -1;
      return this.netToNode.get(net) ?? -1;
    });
    this.tapPrev = new Float64Array(this.probeNodes.length);
    this.tapNow = new Float64Array(this.probeNodes.length);
    this.syncTaps();
  }

  private syncTaps(): void {
    this.sampler.setTapCount(this.probeNodes.length);
    for (let i = 0; i < this.probeNodes.length; i++) {
      const node = this.probeNodes[i];
      this.tapPrev[i] = node >= 0 && node < this.x.length ? this.x[node] : 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Time stepping
  // ---------------------------------------------------------------------------

  /**
   * Advance the circuit by one audio sample period `dt` and return the audio
   * sample. Internally this takes `oversampling` solver steps (more when a
   * step is cut short at an event) and band-limits the result.
   */
  step(dt: number): number {
    if (dt !== this.sampleDt) {
      this.sampleDt = dt;
      this.h = dt / this.oversampling;
      this.hRestart = this.h * RESTART_FRACTION;
      this.dcBlockAlpha = Math.exp(-2 * Math.PI * DC_BLOCK_HZ * dt);
      this.invalidateMatrices();
    }
    if (this.size === 0) return 0;

    this.locatedEvents = 0;
    // A solver step never spans more than one audio sample, so this loop
    // ends as soon as the next sample is ready.
    while (this.sampler.pending() === 0) {
      this.advance();
    }
    return this.finishAudioSample(this.sampler.take());
  }

  /** Take one solver step, cutting it short if a discrete event falls inside it. */
  private advance(): void {
    const be = this.needsRestart;
    const dt = be ? this.hRestart : this.h;
    const du = be ? RESTART_FRACTION * this.cellsPerStep : this.cellsPerStep;
    const x0 = this.x;

    if (!this.solve(dt, be)) {
      // Unusable solution: hold the last good state for a full step, and put
      // the models' iteration state back on it
      const syncModels = this.syncModels;
      for (let i = 0; i < syncModels.length; i++) syncModels[i].syncState!(x0);
      this.needsRestart = true;
      this.emitSegment(this.cellsPerStep, x0);
      return;
    }
    const x1 = this.xNew;

    let theta = Infinity;
    const eventModels = this.eventModels;
    for (let i = 0; i < eventModels.length; i++) {
      const f = eventModels[i].findEvent!(x0, x1);
      if (f < theta) theta = f;
    }

    if (theta > 1) {
      // No event: accept the step as solved
      this.accept(dt, be);
      this.needsRestart = false;
      this.emitSegment(du, this.x);
      return;
    }

    if (this.locatedEvents < MAX_LOCATED_EVENTS_PER_SAMPLE) {
      // Move the solution to the event instant. The step was solved with the
      // pre-event state, which is valid up to exactly that instant.
      this.locatedEvents++;
      if (theta > 0) {
        const n = this.size;
        for (let i = 0; i < n; i++) x0[i] += theta * (x1[i] - x0[i]);
        this.emitSegment(du * theta, x0);
      }
      // The abandoned solve left the models' iteration state at its own
      // solution; put it on the point the next step starts from
      const syncModels = this.syncModels;
      for (let i = 0; i < syncModels.length; i++) syncModels[i].syncState!(x0);
      for (let i = 0; i < eventModels.length; i++) eventModels[i].applyEvent!(theta);
      this.stateDirty = true;
      // The circuit just changed discontinuously: capacitor currents from
      // before the event are no longer valid, so restart with backward Euler.
      this.needsRestart = true;
    } else {
      // Too many events this sample (the circuit is chattering): apply this
      // one at the step boundary and keep taking full steps, so the work per
      // sample stays bounded.
      this.accept(dt, be);
      this.emitSegment(du, this.x);
      for (let i = 0; i < eventModels.length; i++) eventModels[i].applyEvent!(1);
      this.stateDirty = true;
      this.needsRestart = false;
    }
  }

  private accept(dt: number, be: boolean): void {
    const models = this.stepModels;
    for (let i = 0; i < models.length; i++) models[i].postStep!(this.xNew, dt, be);
    const t = this.x;
    this.x = this.xNew;
    this.xNew = t;
  }

  /** The sound at solution `x`, in volts: every tap added together. */
  private audioLevel(x: Float64Array): number {
    const taps = this.audioTaps;
    let level = 0;
    for (let i = 0; i < taps.length; i++) {
      const { positive, negative, trim } = taps[i];
      const v = (positive >= 0 ? x[positive] : 0) - (negative >= 0 ? x[negative] : 0);
      level += trim ? trim.getGain() * v : v;
    }
    return level;
  }

  /** Hand the segment from the previous emitted point to `xEnd` to the output sampler. */
  private emitSegment(du: number, xEnd: Float64Array): void {
    const a1 = this.audioLevel(xEnd);
    const probes = this.probeNodes;
    for (let i = 0; i < probes.length; i++) {
      const node = probes[i];
      this.tapNow[i] = node >= 0 ? xEnd[node] : 0;
    }
    this.sampler.addSegment(du, this.audioPrev, a1, this.tapPrev, this.tapNow);
    this.audioPrev = a1;
    this.tapPrev.set(this.tapNow);
  }

  // ---------------------------------------------------------------------------
  // Linear algebra
  // ---------------------------------------------------------------------------

  /** Solve one step of length dt from this.x into this.xNew. False if the result is unusable. */
  private solve(dt: number, be: boolean): boolean {
    const n = this.size;
    const m = be ? 1 : 0;
    const entry = this.currentEntry();
    if (!entry.valid[m]) {
      this.buildInverse(entry.inv[m], dt, be);
      // K = P·A⁻¹·Pᵀ: the inverse restricted to the nonlinear nodes
      const nodes = this.nlNodes, kn = nodes.length, K = entry.K[m], inv = entry.inv[m];
      for (let i = 0; i < kn; i++) {
        for (let j = 0; j < kn; j++) K[i * kn + j] = inv[nodes[j] * n + nodes[i]];
      }
      entry.valid[m] = true;
    }
    const inv = entry.inv[m];

    // Right-hand side: sources and companion-model history
    const b = this.b;
    b.fill(0);
    const rhsModels = this.rhsModels;
    for (let i = 0; i < rhsModels.length; i++) rhsModels[i].stampRhs!(b, dt, be);
    for (const vs of this.builtinVSources) b[vs.branchIdx] = vs.voltage;

    const k = this.nlNodes.length;
    if (k === 0) {
      // Nothing depends on x: the solution is inverse × RHS
      this.applyInverse(inv, b, this.xNew);
      return this.allFinite(this.xNew);
    }

    // Newton-Raphson. The linear part of the circuit is already inverted, so
    // with y0 = A⁻¹·b the linearized system (A + Pᵀ·G·P)·x = b + Pᵀ·i  (P picks
    // out the k nonlinear nodes) collapses to a k×k solve per iteration:
    //   (I + K·G)·x_N = y0_N + K·i,   K = P·A⁻¹·Pᵀ
    // and the full solution follows as x = y0 + A⁻¹·Pᵀ·(i − G·x_N).
    const nodes = this.nlNodes;
    const y0 = this.nlY0;
    this.applyInverse(inv, b, y0);
    const K = entry.K[m], G = this.nlG, M = this.nlM;

    const nl = this.nonlinearModels;
    const src = this.nlB, rhs = this.nlRhs, xN = this.nlX;
    let xk = this.xIter, xNext = this.xIterNext;
    for (let i = 0; i < k; i++) xk[nodes[i]] = this.x[nodes[i]];

    for (let iter = 0; iter < MAX_NR_ITERATIONS; iter++) {
      // Linearize at the current iterate, then collect and clear the stamps
      for (let i = 0; i < nl.length; i++) nl[i].stampNonlinear!(this.workRows, this.bScratch, xk, dt);
      for (let i = 0; i < k; i++) {
        const row = nodes[i] * n;
        for (let j = 0; j < k; j++) {
          G[i * k + j] = this.work[row + nodes[j]];
          this.work[row + nodes[j]] = 0;
        }
        src[i] = this.bScratch[nodes[i]];
        this.bScratch[nodes[i]] = 0;
      }

      // M = I + K·G and rhs = y0_N + K·i. G is mostly zeros (each device
      // only couples its own nodes), so build M from G's nonzero entries.
      M.fill(0);
      for (let i = 0; i < k; i++) {
        M[i * k + i] = 1;
        rhs[i] = y0[nodes[i]];
      }
      for (let l = 0; l < k; l++) {
        const sl = src[l];
        if (sl !== 0) for (let i = 0; i < k; i++) rhs[i] += K[i * k + l] * sl;
        for (let j = 0; j < k; j++) {
          const g = G[l * k + j];
          if (g === 0) continue;
          for (let i = 0; i < k; i++) M[i * k + j] += K[i * k + l] * g;
        }
      }
      luFactor(M, k, this.nlPiv);
      luSolve(M, k, this.nlPiv, rhs, xN);

      // Converged when every device's linearization holds at the new
      // solution. How far the nodes moved does not matter: given the
      // linearization, the rest of the circuit is solved exactly.
      let maxErr = 0;
      for (let i = 0; i < k; i++) {
        const v = xN[i];
        if (!Number.isFinite(v)) return false;
        xNext[nodes[i]] = v;
      }
      for (let i = 0; i < nl.length; i++) {
        const err = nl[i].convergenceError(xk, xNext);
        if (err > maxErr) maxErr = err;
      }

      const t = xk; xk = xNext; xNext = t;
      if (maxErr < NR_VTOL) break;
    }

    // Full solution from the last linearization
    const out = this.xNew;
    out.set(y0);
    for (let j = 0; j < k; j++) {
      let c = src[j];
      for (let l = 0; l < k; l++) c -= G[j * k + l] * xN[l];
      if (c === 0) continue;
      const off = nodes[j] * n;
      for (let i = 0; i < n; i++) out[i] += inv[off + i] * c;
    }
    return this.allFinite(out);
  }

  /** out = A⁻¹·b, skipping the (many) zero entries of b. */
  private applyInverse(inv: Float64Array, b: Float64Array, out: Float64Array): void {
    const n = this.size;
    out.fill(0);
    for (let j = 0; j < n; j++) {
      const bj = b[j];
      if (bj === 0) continue;
      const off = j * n;
      for (let i = 0; i < n; i++) out[i] += inv[off + i] * bj;
    }
  }

  private allFinite(v: Float64Array): boolean {
    // A NaN or infinity anywhere makes the sum non-finite
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i];
    return Number.isFinite(sum);
  }

  /**
   * Stamp every x-independent matrix entry for the current discrete state,
   * and store the inverse (column-major) in `out`.
   */
  private buildInverse(out: Float64Array, dt: number, be: boolean): void {
    const n = this.size;
    const G = this.workRows;

    const models = this.modelList;
    for (let i = 0; i < models.length; i++) models[i].stampMatrix(G, dt, be);

    for (const vs of this.builtinVSources) {
      const { posNode, negNode, branchIdx } = vs;
      if (posNode >= 0) {
        G[posNode][branchIdx] += 1;
        G[branchIdx][posNode] += 1;
      }
      if (negNode >= 0) {
        G[negNode][branchIdx] -= 1;
        G[branchIdx][negNode] -= 1;
      }
    }

    if (this.bend) {
      const { a, b, g } = this.bend;
      if (a >= 0) G[a][a] += g;
      if (b >= 0) G[b][b] += g;
      if (a >= 0 && b >= 0) {
        G[a][b] -= g;
        G[b][a] -= g;
      }
    }

    // Gmin on the diagonal keeps floating nodes from making the system singular
    for (let i = 0; i < n; i++) G[i][i] += GMIN;

    this.lu.set(this.work);
    this.work.fill(0);
    luFactor(this.lu, n, this.luPiv);
    const unit = this.unit, col = this.col;
    for (let j = 0; j < n; j++) {
      unit[j] = 1;
      luSolve(this.lu, n, this.luPiv, unit, col);
      unit[j] = 0;
      out.set(col, j * n);
    }
  }

  /** Cache entry for the circuit's current discrete state (gate outputs, clamps, ...). */
  private currentEntry(): MatrixEntry {
    if (!this.stateDirty && this.entry) return this.entry;

    const eventModels = this.eventModels;
    const cur = this.curState;
    let hash = 0;
    for (let i = 0; i < eventModels.length; i++) {
      const state = eventModels[i].getDiscreteState!();
      cur[i] = state;
      hash = (Math.imul(hash, 31) + (state | 0) + ((state / 4294967296) | 0)) | 0;
    }

    const stamp = ++this.useCounter;
    let found: MatrixEntry | null = null;
    let oldest: MatrixEntry | null = null;
    for (const e of this.cache) {
      if (e.hash === hash) {
        let same = true;
        for (let i = 0; i < cur.length; i++) {
          if (e.state[i] !== cur[i]) { same = false; break; }
        }
        if (same) { found = e; break; }
      }
      if (!oldest || e.lastUsed < oldest.lastUsed) oldest = e;
    }

    if (!found) {
      if (this.cache.length < this.maxCacheEntries || !oldest) {
        const nn = this.size * this.size;
        const kk = this.nlNodes.length * this.nlNodes.length;
        found = {
          state: new Float64Array(cur.length),
          hash: 0,
          inv: [new Float64Array(nn), new Float64Array(nn)],
          K: [new Float64Array(kk), new Float64Array(kk)],
          valid: [false, false],
          lastUsed: 0,
        };
        this.cache.push(found);
      } else {
        found = oldest; // recycle the least recently used entry
        found.valid[0] = false;
        found.valid[1] = false;
      }
      found.state.set(cur);
      found.hash = hash;
    }

    found.lastUsed = stamp;
    this.entry = found;
    this.stateDirty = false;
    return found;
  }

  // ---------------------------------------------------------------------------
  // Audio output
  // ---------------------------------------------------------------------------

  private finishAudioSample(raw: number): number {
    if (this.audioTaps.length === 0) return 0;

    // DC blocker: y[n] = x[n] - x[n-1] + alpha * y[n-1]
    const filtered = raw - this.dcBlockPrev + this.dcBlockAlpha * this.dcBlockOut;
    this.dcBlockPrev = raw;
    this.dcBlockOut = filtered;

    // A rail-to-rail swing maps to ±0.5. The band-limited signal overshoots
    // its ideal levels at edges; the headroom keeps that out of the clipper,
    // which would otherwise put the aliasing straight back. The jack's input
    // trim brings quieter (line-level) circuits up to a comparable level.
    const v = this.supplyVoltage || 9;
    const gain = this.audioTrim ? this.audioTrim.getGain() : 1;
    return Math.max(-1, Math.min(1, gain * filtered / v));
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
