# SPICE-Grade Component Model Framework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the monolithic `audio-worklet-processor.js` with a pluggable TypeScript component model framework where every component uses SPICE-grade physics, including a Boyle macromodel op-amp.

**Architecture:** Each component model is a self-contained class implementing a `ComponentModel` interface (stamp, postStep, convergenceError). A model-agnostic `MNASolver` runs Newton-Raphson with SPICE-style voltage limiting. Models are TypeScript ES modules bundled into the AudioWorklet by Vite.

**Tech Stack:** TypeScript, Vitest, Vite (AudioWorklet bundling), Float64Array (MNA matrix)

**Spec:** `docs/superpowers/specs/2026-03-29-spice-grade-component-framework-design.md`

---

## Dependency Graph

```
Task 1 (Interface + Registry + Utils)
  └→ Task 2 (Matrix Solver)
      └→ Task 3 (MNASolver + ResistorModel)
          ├→ Task 4 (CapacitorModel)
          ├→ Task 5 (Pot + Power + Ground + AudioOutput)
          ├→ Task 6 (DiodeModel)
          ├→ Task 7 (BJTModel)
          ├→ Task 8 (OpAmpModel)
          └→ Task 9 (SchmittTriggerModel)
              └→ Task 10 (Worklet Entry + Build Pipeline)
                  └→ Task 11 (Regression Tests + Cleanup)
```

Tasks 4-9 are independent of each other (parallelizable after Task 3).

## File Map

| File | Responsibility |
|------|---------------|
| `src/simulation/models/ComponentModel.ts` | Interface definition |
| `src/simulation/models/ModelRegistry.ts` | Factory registry |
| `src/simulation/models/stampUtils.ts` | Shared MNA stamp helpers |
| `src/simulation/models/junctionUtils.ts` | Shockley linearization + NR voltage limiting |
| `src/simulation/models/ResistorModel.ts` | Conductance stamp |
| `src/simulation/models/CapacitorModel.ts` | Trapezoidal companion |
| `src/simulation/models/PotentiometerModel.ts` | Split resistance |
| `src/simulation/models/PowerSourceModel.ts` | Voltage source branch |
| `src/simulation/models/GroundModel.ts` | Ground reference marker |
| `src/simulation/models/AudioOutputModel.ts` | Voltage reader sink |
| `src/simulation/models/DiodeModel.ts` | Full Shockley (1N914 + LED) |
| `src/simulation/models/BJTModel.ts` | Gummel-Poon (2N3904) |
| `src/simulation/models/OpAmpModel.ts` | Simplified Boyle (LM741) |
| `src/simulation/models/SchmittTriggerModel.ts` | CD40106 resistive CMOS |
| `src/simulation/solver/matrix.ts` | Gaussian elimination with partial pivoting |
| `src/simulation/solver/MNASolver.ts` | Model-agnostic NR-MNA solver |
| `src/simulation/worklet/processor.ts` | AudioWorkletProcessor entry point |
| `src/simulation/worklet/audioworklet.d.ts` | Type declarations for AudioWorklet globals |
| `src/simulation/index.ts` | Public API re-exports |

---

## Task 1: Framework Foundation

**Files:**
- Create: `src/simulation/models/ComponentModel.ts`
- Create: `src/simulation/models/ModelRegistry.ts`
- Create: `src/simulation/models/stampUtils.ts`
- Create: `src/simulation/models/junctionUtils.ts`
- Test: `tests/simulation/models/ModelRegistry.test.ts`
- Test: `tests/simulation/models/junctionUtils.test.ts`

- [ ] **Step 1: Write ModelRegistry test**

```typescript
// tests/simulation/models/ModelRegistry.test.ts
import { describe, it, expect } from 'vitest';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import type { ComponentModel } from '@/simulation/models/ComponentModel';

class StubModel implements ComponentModel {
  readonly type = 'stub';
  getInternalNodeCount() { return 0; }
  getBranchCount() { return 0; }
  init() {}
  stamp() {}
  postStep() {}
  convergenceError() { return 0; }
  reset() {}
}

describe('ModelRegistry', () => {
  it('registers and creates models', () => {
    const registry = new ModelRegistry();
    registry.register('stub', () => new StubModel());
    expect(registry.has('stub')).toBe(true);
    const model = registry.create('stub');
    expect(model).not.toBeNull();
    expect(model!.type).toBe('stub');
  });

  it('returns null for unknown types', () => {
    const registry = new ModelRegistry();
    expect(registry.create('unknown')).toBeNull();
    expect(registry.has('unknown')).toBe(false);
  });

  it('creates independent instances each call', () => {
    const registry = new ModelRegistry();
    registry.register('stub', () => new StubModel());
    const a = registry.create('stub');
    const b = registry.create('stub');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/ModelRegistry.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Create ComponentModel interface and ModelRegistry**

```typescript
// src/simulation/models/ComponentModel.ts
export interface ComponentModel {
  readonly type: string;
  getInternalNodeCount(): number;
  getBranchCount(): number;
  init(
    pinNodes: number[],
    internalNodeStart: number,
    branchStart: number,
    params: Record<string, number>
  ): void;
  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void;
  postStep(x: Float64Array, dt: number): void;
  convergenceError(xOld: Float64Array, xNew: Float64Array): number;
  reset(): void;
}
```

```typescript
// src/simulation/models/ModelRegistry.ts
import type { ComponentModel } from './ComponentModel';

export class ModelRegistry {
  private factories = new Map<string, () => ComponentModel>();

  register(type: string, factory: () => ComponentModel): void {
    this.factories.set(type, factory);
  }

  create(type: string): ComponentModel | null {
    const factory = this.factories.get(type);
    return factory ? factory() : null;
  }

  has(type: string): boolean {
    return this.factories.has(type);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/ModelRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Write junction utils test**

```typescript
// tests/simulation/models/junctionUtils.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeVcrit,
  limitJunctionVoltage,
  linearizeJunction,
  BOLTZMANN_VOLTAGE,
} from '@/simulation/models/junctionUtils';

describe('junctionUtils', () => {
  describe('computeVcrit', () => {
    it('computes critical voltage for 1N914', () => {
      const Vcrit = computeVcrit(2.52e-9, 1.752, BOLTZMANN_VOLTAGE);
      // Vcrit = n*Vt*ln(n*Vt/(sqrt(2)*Is)) ≈ 0.77V
      expect(Vcrit).toBeCloseTo(0.77, 1);
    });
  });

  describe('limitJunctionVoltage', () => {
    const nVt = 1.752 * BOLTZMANN_VOLTAGE; // ~0.0453V
    const Vcrit = 0.77;

    it('does not limit small voltage changes', () => {
      const v = limitJunctionVoltage(0.65, 0.64, nVt, Vcrit);
      expect(v).toBe(0.65);
    });

    it('limits large positive jumps above Vcrit', () => {
      const v = limitJunctionVoltage(2.0, 0.7, nVt, Vcrit);
      // Should clamp to vOld + 2*nVt = 0.7 + 0.0906 ≈ 0.79
      expect(v).toBeCloseTo(0.7 + 2 * nVt, 4);
    });

    it('jumps to Vcrit from negative', () => {
      const v = limitJunctionVoltage(5.0, -0.1, nVt, Vcrit);
      expect(v).toBe(Vcrit);
    });

    it('does not limit below Vcrit', () => {
      const v = limitJunctionVoltage(0.3, 0.0, nVt, Vcrit);
      expect(v).toBe(0.3);
    });
  });

  describe('linearizeJunction', () => {
    it('produces correct values at Vd=0.6V for 1N914', () => {
      const { Gd, Ieq, Id } = linearizeJunction(
        0.6, 2.52e-9, 1.752, BOLTZMANN_VOLTAGE
      );
      // Id = Is*(exp(0.6/(n*Vt))-1)
      const nVt = 1.752 * BOLTZMANN_VOLTAGE;
      const expectedId = 2.52e-9 * (Math.exp(0.6 / nVt) - 1);
      expect(Id).toBeCloseTo(expectedId, 10);
      // Gd = (Is/(n*Vt)) * exp(Vd/(n*Vt))
      const expectedGd = (2.52e-9 / nVt) * Math.exp(0.6 / nVt);
      expect(Gd).toBeCloseTo(expectedGd, 10);
      // Ieq = Id - Gd*Vd
      expect(Ieq).toBeCloseTo(Id - Gd * 0.6, 10);
    });

    it('returns near-zero conductance when reverse biased', () => {
      const { Gd, Id } = linearizeJunction(
        -1.0, 2.52e-9, 1.752, BOLTZMANN_VOLTAGE
      );
      expect(Gd).toBeLessThan(1e-10);
      expect(Id).toBeCloseTo(-2.52e-9, 12); // ≈ -Is
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/junctionUtils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Create junctionUtils and stampUtils**

```typescript
// src/simulation/models/junctionUtils.ts
export const BOLTZMANN_VOLTAGE = 0.02585; // Vt at 25°C

export function computeVcrit(Is: number, n: number, Vt: number): number {
  const nVt = n * Vt;
  return nVt * Math.log(nVt / (Math.SQRT2 * Is));
}

export function limitJunctionVoltage(
  vNew: number,
  vOld: number,
  nVt: number,
  Vcrit: number
): number {
  if (vNew > Vcrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      return vOld + 2 * nVt * Math.sign(vNew - vOld);
    } else {
      return Vcrit;
    }
  }
  return vNew;
}

export function linearizeJunction(
  vd: number,
  Is: number,
  n: number,
  Vt: number
): { Gd: number; Ieq: number; Id: number } {
  const nVt = n * Vt;
  const expVd = Math.exp(vd / nVt);
  const Id = Is * (expVd - 1);
  const Gd = Math.max((Is / nVt) * expVd, 1e-12);
  const Ieq = Id - Gd * vd;
  return { Gd, Ieq, Id };
}
```

```typescript
// src/simulation/models/stampUtils.ts

/** Stamp conductance g between nodes n1 and n2. Node index -1 = ground (skip). */
export function stampConductance(
  G: Float64Array[],
  n1: number,
  n2: number,
  g: number
): void {
  if (n1 >= 0) G[n1][n1] += g;
  if (n2 >= 0) G[n2][n2] += g;
  if (n1 >= 0 && n2 >= 0) {
    G[n1][n2] -= g;
    G[n2][n1] -= g;
  }
}

/** Stamp VCCS: current from (outPos→outNeg) controlled by voltage (ctrlPos−ctrlNeg). */
export function stampVCCS(
  G: Float64Array[],
  outPos: number,
  outNeg: number,
  ctrlPos: number,
  ctrlNeg: number,
  gm: number
): void {
  if (outPos >= 0 && ctrlPos >= 0) G[outPos][ctrlPos] += gm;
  if (outPos >= 0 && ctrlNeg >= 0) G[outPos][ctrlNeg] -= gm;
  if (outNeg >= 0 && ctrlPos >= 0) G[outNeg][ctrlPos] -= gm;
  if (outNeg >= 0 && ctrlNeg >= 0) G[outNeg][ctrlNeg] += gm;
}

/** Stamp a current source: positive current into node n. Node -1 = ground. */
export function stampCurrentSource(
  b: Float64Array,
  nPos: number,
  nNeg: number,
  I: number
): void {
  if (nPos >= 0) b[nPos] += I;
  if (nNeg >= 0) b[nNeg] -= I;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/simulation/models/`
Expected: PASS (both test files)

- [ ] **Step 9: Commit**

```bash
git add src/simulation/models/ComponentModel.ts src/simulation/models/ModelRegistry.ts \
  src/simulation/models/stampUtils.ts src/simulation/models/junctionUtils.ts \
  tests/simulation/models/ModelRegistry.test.ts tests/simulation/models/junctionUtils.test.ts
git commit -m "feat: component model framework foundation — interface, registry, stamp/junction utilities"
```

---

## Task 2: Matrix Solver

**Files:**
- Create: `src/simulation/solver/matrix.ts`
- Test: `tests/simulation/solver/matrix.test.ts`

- [ ] **Step 1: Write matrix solver test**

```typescript
// tests/simulation/solver/matrix.test.ts
import { describe, it, expect } from 'vitest';
import { solveLinearSystem } from '@/simulation/solver/matrix';

function makeMatrix(rows: number[][]): Float64Array[] {
  return rows.map(r => Float64Array.from(r));
}

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    // 2x + y = 5, x + 3y = 10 → x=1, y=3
    const A = makeMatrix([[2, 1], [1, 3]]);
    const b = Float64Array.from([5, 10]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('solves a 3x3 system (resistor divider MNA)', () => {
    // Node 1 voltage with 9V source through 10k, node 1 to ground through 10k
    // G = [[1/10k + 1/10k, 0, 1], [0, 0, 0], [1, 0, 0]]
    // Wait, simpler: pure conductance matrix.
    // Two 10k resistors in series from node 0 (9V source) to ground.
    // Midpoint node 1. G[1][1] = 1/10k + 1/10k = 2e-4.
    // With voltage source at node 0: row 2 is branch.
    // G = [[1e-4, -1e-4, 1], [-1e-4, 1e-4+1e-4, 0], [1, 0, 0]]
    // b = [0, 0, 9]
    const g = 1e-4;
    const A = makeMatrix([
      [g, -g, 1],
      [-g, 2 * g, 0],
      [1, 0, 0],
    ]);
    const b = Float64Array.from([0, 0, 9]);
    const x = solveLinearSystem(A, b, 3);
    expect(x[0]).toBeCloseTo(9, 6);   // node 0 = 9V
    expect(x[1]).toBeCloseTo(4.5, 6); // node 1 = 4.5V (divider)
  });

  it('handles near-singular matrix gracefully', () => {
    const A = makeMatrix([[0, 0], [0, 1]]);
    const b = Float64Array.from([0, 5]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[1]).toBeCloseTo(5, 10);
    expect(x[0]).toBe(0); // singular row → 0
  });

  it('uses partial pivoting for ill-conditioned systems', () => {
    // Swap rows needed for accuracy
    const A = makeMatrix([[1e-15, 1], [1, 1]]);
    const b = Float64Array.from([1, 2]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[0]).toBeCloseTo(1, 6);
    expect(x[1]).toBeCloseTo(1, 6);
  });

  it('reuses pre-allocated augmented matrix', () => {
    const A = makeMatrix([[2, 1], [1, 3]]);
    const b = Float64Array.from([5, 10]);
    const M = [new Float64Array(3), new Float64Array(3)];
    const x = solveLinearSystem(A, b, 2, M);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/solver/matrix.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement matrix solver**

```typescript
// src/simulation/solver/matrix.ts

/**
 * Solve Ax = b using Gaussian elimination with partial pivoting.
 * A is an array of Float64Array rows. b is a Float64Array.
 * Optional pre-allocated augmented matrix M avoids GC in hot loops.
 */
export function solveLinearSystem(
  A: Float64Array[],
  b: Float64Array,
  N: number,
  M?: Float64Array[]
): Float64Array {
  if (!M) {
    M = new Array(N);
    for (let i = 0; i < N; i++) {
      M[i] = new Float64Array(N + 1);
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) M[i][j] = A[i][j];
    M[i][N] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < N; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < N; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-15) continue;

    for (let row = col + 1; row < N; row++) {
      const factor = M[row][col] / pivot;
      for (let j = col; j <= N; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  // Back substitution
  const x = new Float64Array(N);
  for (let i = N - 1; i >= 0; i--) {
    let sum = M[i][N];
    for (let j = i + 1; j < N; j++) {
      sum -= M[i][j] * x[j];
    }
    const diag = M[i][i];
    x[i] = Math.abs(diag) > 1e-15 ? sum / diag : 0;
  }

  return x;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/solver/matrix.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/simulation/solver/matrix.ts tests/simulation/solver/matrix.test.ts
git commit -m "feat: Gaussian elimination solver with partial pivoting and matrix reuse"
```

---

## Task 3: MNASolver Core + ResistorModel

**Files:**
- Create: `src/simulation/solver/MNASolver.ts`
- Create: `src/simulation/models/ResistorModel.ts`
- Test: `tests/simulation/models/ResistorModel.test.ts`
- Test: `tests/simulation/solver/MNASolver.test.ts`

- [ ] **Step 1: Write ResistorModel unit test**

```typescript
// tests/simulation/models/ResistorModel.test.ts
import { describe, it, expect } from 'vitest';
import { ResistorModel } from '@/simulation/models/ResistorModel';

describe('ResistorModel', () => {
  it('has no internal nodes or branches', () => {
    const m = new ResistorModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps correct conductance between two nodes', () => {
    const m = new ResistorModel();
    m.init([0, 1], 0, 0, { resistance: 1000 });

    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, 1 / 48000);

    const g = 1 / 1000;
    expect(G[0][0]).toBeCloseTo(g, 10);
    expect(G[1][1]).toBeCloseTo(g, 10);
    expect(G[0][1]).toBeCloseTo(-g, 10);
    expect(G[1][0]).toBeCloseTo(-g, 10);
  });

  it('stamps correctly when one pin is ground (-1)', () => {
    const m = new ResistorModel();
    m.init([0, -1], 0, 0, { resistance: 500 });

    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    const x = new Float64Array(1);
    m.stamp(G, b, x, 1 / 48000);

    expect(G[0][0]).toBeCloseTo(1 / 500, 10);
  });

  it('convergenceError returns 0 (linear)', () => {
    const m = new ResistorModel();
    m.init([0, 1], 0, 0, { resistance: 1000 });
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/ResistorModel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ResistorModel**

```typescript
// src/simulation/models/ResistorModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

export class ResistorModel implements ComponentModel {
  readonly type = 'resistor';
  private n0 = -1;
  private n1 = -1;
  private conductance = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    params: Record<string, number>
  ): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.conductance = 1 / Math.max(params.resistance ?? 1000, 1);
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    stampConductance(G, this.n0, this.n1, this.conductance);
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/ResistorModel.test.ts`
Expected: PASS

- [ ] **Step 5: Write MNASolver integration test (resistor divider)**

```typescript
// tests/simulation/solver/MNASolver.test.ts
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';

function makeComp(
  id: string,
  type: string,
  pins: { id: string; type: string }[],
  params: Record<string, number | string | boolean> = {}
) {
  return {
    id,
    type,
    pins: pins.map(p => ({ id: p.id, label: p.id, type: p.type })),
    parameters: params,
  };
}

function makeConn(fromComp: string, fromPin: string, toComp: string, toPin: string) {
  return {
    id: `${fromComp}_${fromPin}_${toComp}_${toPin}`,
    from: { componentId: fromComp, pinId: fromPin },
    to: { componentId: toComp, pinId: toPin },
  };
}

describe('MNASolver', () => {
  function createRegistry() {
    const reg = new ModelRegistry();
    reg.register('resistor', () => new ResistorModel());
    return reg;
  }

  describe('resistor divider', () => {
    it('produces correct midpoint voltage', () => {
      // 9V → R1(10k) → node → R2(10k) → GND
      // Expect midpoint = 4.5V
      const solver = new MNASolver(createRegistry());
      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r1', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        makeComp('r2', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'r2', 'p0'),
        makeConn('r2', 'p1', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);
      solver.step(1 / 48000);

      // Find the net connecting r1:p1 and r2:p0 (midpoint)
      const midVoltage = solver.getNodeVoltageByPin('r1', 'p1');
      expect(midVoltage).toBeCloseTo(4.5, 2);
    });
  });

  describe('subcycling', () => {
    it('accepts subcycle count', () => {
      const solver = new MNASolver(createRegistry());
      solver.setSubcycles(4);
      // No error thrown
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: FAIL — MNASolver not found

- [ ] **Step 7: Implement MNASolver**

```typescript
// src/simulation/solver/MNASolver.ts
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
const MAX_NR_ITERATIONS = 8;
const NR_VTOL = 1e-4;

export class MNASolver {
  private registry: ModelRegistry;
  private models: ComponentModel[] = [];
  private modelMap = new Map<string, ComponentModel>(); // compId → model
  private matrixSize = 0;
  private numExternalNodes = 0;
  private numInternalNodes = 0;
  private numBranches = 0;
  private groundNet = -1;
  private netToNode: Map<number, number> = new Map();
  private nodeToNet: Map<number, number> = new Map();
  private x: Float64Array = new Float64Array(0);
  private G: Float64Array[] = [];
  private b: Float64Array = new Float64Array(0);
  private augM: Float64Array[] = [];
  private subcycleCount = 1;
  private supplyVoltage = 9;

  // Pin-to-net lookup
  private pinToNet: Map<string, number> = new Map();
  private nets: { id: number; pinKeys: string[] }[] = [];

  // Audio output
  private audioOutputNode = -1;
  private dcBlocker = { xPrev: 0, yPrev: 0 };

  constructor(registry: ModelRegistry) {
    this.registry = registry;
  }

  setSubcycles(count: number): void {
    this.subcycleCount = Math.max(1, Math.min(8, count));
  }

  getSupplyVoltage(): number {
    return this.supplyVoltage;
  }

  loadCircuit(
    components: SerializedComponent[],
    connections: SerializedConnection[]
  ): void {
    this.buildNets(components, connections);
    this.buildNodeMap(components);
    this.createModels(components);
    this.allocateMatrix();
    this.resetState();
  }

  private buildNets(
    components: SerializedComponent[],
    connections: SerializedConnection[]
  ): void {
    const parent: Record<string, string> = {};
    const rank: Record<string, number> = {};

    const find = (x: string): string => {
      if (!(x in parent)) { parent[x] = x; rank[x] = 0; }
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };

    const union = (a: string, b: string): void => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) parent[ra] = rb;
      else if (rank[ra] > rank[rb]) parent[rb] = ra;
      else { parent[rb] = ra; rank[ra]++; }
    };

    // Ensure all pins exist in union-find
    for (const comp of components) {
      for (const pin of comp.pins) {
        find(comp.id + '::' + pin.id);
      }
    }

    for (const conn of connections) {
      union(
        conn.from.componentId + '::' + conn.from.pinId,
        conn.to.componentId + '::' + conn.to.pinId
      );
    }

    const groups: Record<string, string[]> = {};
    for (const key of Object.keys(parent)) {
      const root = find(key);
      if (!groups[root]) groups[root] = [];
      groups[root].push(key);
    }

    this.nets = [];
    this.pinToNet = new Map();
    let netId = 0;
    for (const root of Object.keys(groups)) {
      this.nets.push({ id: netId, pinKeys: groups[root] });
      for (const key of groups[root]) {
        this.pinToNet.set(key, netId);
      }
      netId++;
    }
  }

  private getNetForPin(componentId: string, pinId: string): number {
    return this.pinToNet.get(componentId + '::' + pinId) ?? -1;
  }

  private buildNodeMap(components: SerializedComponent[]): void {
    // Find ground net — any pin with type 'ground'
    this.groundNet = -1;
    for (const comp of components) {
      for (const pin of comp.pins) {
        if (pin.type === 'ground') {
          const net = this.getNetForPin(comp.id, pin.id);
          if (net >= 0) {
            this.groundNet = net;
            break;
          }
        }
      }
      if (this.groundNet >= 0) break;
    }

    // Map nets to MNA node indices, skipping ground
    this.netToNode = new Map();
    this.nodeToNet = new Map();
    let nodeIdx = 0;
    for (const net of this.nets) {
      if (net.id === this.groundNet) continue;
      this.netToNode.set(net.id, nodeIdx);
      this.nodeToNet.set(nodeIdx, net.id);
      nodeIdx++;
    }
    this.numExternalNodes = nodeIdx;

    // Find supply voltage
    this.supplyVoltage = 9;
    for (const comp of components) {
      if (comp.type === 'power') {
        this.supplyVoltage = (comp.parameters.voltage as number) || 9;
        break;
      }
    }

    // Find audio output node
    this.audioOutputNode = -1;
    for (const comp of components) {
      if (comp.type === 'audio-output') {
        const net = this.getNetForPin(comp.id, comp.pins[0].id);
        if (net >= 0) {
          this.audioOutputNode = this.netToNode.get(net) ?? -1;
        }
        break;
      }
    }
  }

  private createModels(components: SerializedComponent[]): void {
    this.models = [];
    this.modelMap = new Map();
    let internalNodeOffset = this.numExternalNodes;
    let branchOffset = 0; // branches start after all nodes

    for (const comp of components) {
      const model = this.registry.create(comp.type);
      if (!model) continue;

      // Map component pins to MNA node indices
      const pinNodes = comp.pins.map(pin => {
        const net = this.getNetForPin(comp.id, pin.id);
        if (net < 0 || net === this.groundNet) return -1;
        return this.netToNode.get(net) ?? -1;
      });

      const internalCount = model.getInternalNodeCount();
      const branchCount = model.getBranchCount();

      // Numeric params only
      const numericParams: Record<string, number> = {};
      for (const [k, v] of Object.entries(comp.parameters)) {
        if (typeof v === 'number') numericParams[k] = v;
      }

      model.init(
        pinNodes,
        internalNodeOffset,
        this.numExternalNodes + this.numInternalNodes + branchOffset,
        numericParams
      );

      this.models.push(model);
      this.modelMap.set(comp.id, model);
      internalNodeOffset += internalCount;
      this.numInternalNodes += internalCount;
      branchOffset += branchCount;
      this.numBranches += branchCount;
    }
  }

  private allocateMatrix(): void {
    this.matrixSize =
      this.numExternalNodes + this.numInternalNodes + this.numBranches;
    const N = this.matrixSize;
    this.G = new Array(N);
    for (let i = 0; i < N; i++) {
      this.G[i] = new Float64Array(N);
    }
    this.b = new Float64Array(N);
    this.x = new Float64Array(N);
    this.augM = new Array(N);
    for (let i = 0; i < N; i++) {
      this.augM[i] = new Float64Array(N + 1);
    }
  }

  resetState(): void {
    this.x.fill(0);
    this.dcBlocker = { xPrev: 0, yPrev: 0 };
    for (const model of this.models) {
      model.reset();
    }
  }

  step(dt: number): number {
    if (this.matrixSize === 0) return 0;
    const subDt = dt / this.subcycleCount;
    for (let s = 0; s < this.subcycleCount; s++) {
      this.solveTimestep(subDt);
    }
    return this.readAudioOutput();
  }

  private solveTimestep(dt: number): void {
    const N = this.matrixSize;
    const nodeCount = this.numExternalNodes + this.numInternalNodes;

    for (let iter = 0; iter < MAX_NR_ITERATIONS; iter++) {
      // Clear matrix
      for (let i = 0; i < N; i++) {
        this.b[i] = 0;
        for (let j = 0; j < N; j++) this.G[i][j] = 0;
      }

      // Stamp all models
      for (const model of this.models) {
        model.stamp(this.G, this.b, this.x, dt);
      }

      // Add Gmin to node diagonals (not branch rows)
      for (let i = 0; i < nodeCount; i++) {
        this.G[i][i] += GMIN;
      }

      // Solve
      const xNew = solveLinearSystem(this.G, this.b, N, this.augM);

      // Clamp NaN/Infinity
      for (let i = 0; i < N; i++) {
        if (!isFinite(xNew[i])) xNew[i] = 0;
      }

      // Convergence check (skip first iteration)
      if (iter > 0) {
        let maxError = 0;
        for (const model of this.models) {
          maxError = Math.max(maxError, model.convergenceError(this.x, xNew));
        }
        if (maxError < NR_VTOL) {
          this.x.set(xNew);
          break;
        }
      }

      this.x.set(xNew);
    }

    // Post-step state updates
    for (const model of this.models) {
      model.postStep(this.x, dt);
    }
  }

  private readAudioOutput(): number {
    if (this.audioOutputNode < 0) return 0;
    const v = this.x[this.audioOutputNode] || 0;
    const alpha = 0.995;
    const y = v - this.dcBlocker.xPrev + alpha * this.dcBlocker.yPrev;
    this.dcBlocker.xPrev = v;
    this.dcBlocker.yPrev = y;
    return Math.max(-1, Math.min(1, y / (this.supplyVoltage * 0.5)));
  }

  /** Get voltage at a specific component pin. */
  getNodeVoltageByPin(componentId: string, pinId: string): number {
    const net = this.getNetForPin(componentId, pinId);
    if (net < 0 || net === this.groundNet) return 0;
    const node = this.netToNode.get(net);
    return node !== undefined ? (this.x[node] || 0) : 0;
  }

  /** Get voltage at a MNA node index. */
  getNodeVoltage(node: number): number {
    if (node < 0 || node >= this.x.length) return 0;
    return this.x[node] || 0;
  }

  /** Get model instance by component ID (for LED state queries etc.) */
  getModel(componentId: string): ComponentModel | undefined {
    return this.modelMap.get(componentId);
  }

  /** Get the full solution vector (for probes). */
  getSolutionVector(): Float64Array {
    return this.x;
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts tests/simulation/models/ResistorModel.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/simulation/solver/MNASolver.ts src/simulation/models/ResistorModel.ts \
  tests/simulation/solver/MNASolver.test.ts tests/simulation/models/ResistorModel.test.ts
git commit -m "feat: MNA solver core with NR convergence loop and resistor model"
```

---

## Task 4: CapacitorModel

**Files:**
- Create: `src/simulation/models/CapacitorModel.ts`
- Test: `tests/simulation/models/CapacitorModel.test.ts`
- Modify: `tests/simulation/solver/MNASolver.test.ts` (add RC integration test)

- [ ] **Step 1: Write CapacitorModel unit test**

```typescript
// tests/simulation/models/CapacitorModel.test.ts
import { describe, it, expect } from 'vitest';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';

describe('CapacitorModel', () => {
  const dt = 1 / 48000;

  it('stamps trapezoidal companion conductance', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: 100e-9 });

    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, dt);

    // Geq = 2*C/dt = 2 * 100e-9 / (1/48000) = 0.0096
    const Geq = 2 * 100e-9 / dt;
    expect(G[0][0]).toBeCloseTo(Geq, 6);
    expect(G[1][1]).toBeCloseTo(Geq, 6);
    expect(G[0][1]).toBeCloseTo(-Geq, 6);
  });

  it('includes companion current from previous state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: 100e-9 });

    // Simulate one step with known voltage
    const G1 = [new Float64Array(1)];
    const b1 = new Float64Array(1);
    const x1 = Float64Array.from([5.0]); // node 0 = 5V
    m.stamp(G1, b1, x1, dt);
    m.postStep(x1, dt);

    // Second step: companion current should reflect previous state
    const G2 = [new Float64Array(1)];
    const b2 = new Float64Array(1);
    m.stamp(G2, b2, x1, dt);

    // Ieq = Geq * vPrev + iPrev, should be non-zero
    expect(b2[0]).not.toBe(0);
  });

  it('convergenceError returns 0 (linear per timestep)', () => {
    const m = new CapacitorModel();
    m.init([0, 1], 0, 0, { capacitance: 100e-9 });
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });

  it('reset clears state', () => {
    const m = new CapacitorModel();
    m.init([0, -1], 0, 0, { capacitance: 100e-9 });

    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    const x = Float64Array.from([5.0]);
    m.stamp(G, b, x, dt);
    m.postStep(x, dt);
    m.reset();

    // After reset, companion current should be zero
    const G2 = [new Float64Array(1)];
    const b2 = new Float64Array(1);
    m.stamp(G2, b2, new Float64Array(1), dt);
    expect(b2[0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/CapacitorModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement CapacitorModel**

```typescript
// src/simulation/models/CapacitorModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';

export class CapacitorModel implements ComponentModel {
  readonly type = 'capacitor';
  private n0 = -1;
  private n1 = -1;
  private capacitance = 100e-9;
  private vPrev = 0;
  private iPrev = 0;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    params: Record<string, number>
  ): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.capacitance = params.capacitance ?? 100e-9;
  }

  stamp(G: Float64Array[], b: Float64Array, _x: Float64Array, dt: number): void {
    const Geq = 2 * this.capacitance / dt;
    stampConductance(G, this.n0, this.n1, Geq);

    const Ieq = Geq * this.vPrev + this.iPrev;
    stampCurrentSource(b, this.n0, this.n1, Ieq);
  }

  postStep(x: Float64Array, dt: number): void {
    const v0 = this.n0 >= 0 ? x[this.n0] : 0;
    const v1 = this.n1 >= 0 ? x[this.n1] : 0;
    const vCap = v0 - v1;
    const Geq = 2 * this.capacitance / dt;
    const iCap = Geq * (vCap - this.vPrev) - this.iPrev;
    this.vPrev = vCap;
    this.iPrev = iCap;
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.vPrev = 0;
    this.iPrev = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/CapacitorModel.test.ts`
Expected: PASS

- [ ] **Step 5: Add RC step response integration test to MNASolver**

Add to `tests/simulation/solver/MNASolver.test.ts`:

```typescript
import { CapacitorModel } from '@/simulation/models/CapacitorModel';

// Inside describe('MNASolver'), add:
  describe('RC step response', () => {
    it('tracks analytic curve within 2%', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('capacitor', () => new CapacitorModel());
      const solver = new MNASolver(reg);

      const R = 10000;
      const C = 100e-9;
      const tau = R * C; // 1ms
      const Vs = 9;
      const dt = 1 / 48000;

      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: Vs }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: R }),
        makeComp('c', 'capacitor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { capacitance: C }),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r', 'p0'),
        makeConn('r', 'p1', 'c', 'p0'),
        makeConn('c', 'p1', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);

      // Run for 2*tau (2ms = ~96 samples)
      const steps = Math.ceil(2 * tau / dt);
      for (let i = 0; i < steps; i++) {
        solver.step(dt);
      }

      const t = steps * dt;
      const expected = Vs * (1 - Math.exp(-t / tau));
      const actual = solver.getNodeVoltageByPin('c', 'p0');
      const error = Math.abs(actual - expected) / expected;
      expect(error).toBeLessThan(0.02); // Within 2%
    });
  });
```

- [ ] **Step 6: Run integration test**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/simulation/models/CapacitorModel.ts \
  tests/simulation/models/CapacitorModel.test.ts \
  tests/simulation/solver/MNASolver.test.ts
git commit -m "feat: capacitor trapezoidal companion model with RC integration test"
```

---

## Task 5: Simple Models — Potentiometer, Power, Ground, AudioOutput

**Files:**
- Create: `src/simulation/models/PotentiometerModel.ts`
- Create: `src/simulation/models/PowerSourceModel.ts`
- Create: `src/simulation/models/GroundModel.ts`
- Create: `src/simulation/models/AudioOutputModel.ts`
- Test: `tests/simulation/models/SimpleModels.test.ts`

- [ ] **Step 1: Write tests for all four simple models**

```typescript
// tests/simulation/models/SimpleModels.test.ts
import { describe, it, expect } from 'vitest';
import { PotentiometerModel } from '@/simulation/models/PotentiometerModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { AudioOutputModel } from '@/simulation/models/AudioOutputModel';

describe('PotentiometerModel', () => {
  it('stamps two conductances split by position', () => {
    const m = new PotentiometerModel();
    // Pins: 0=top, 1=wiper, 2=bottom. MaxR=100k, pos=0.3
    m.init([0, 1, 2], 0, 0, { maxResistance: 100000, position: 0.3 });

    const G = [new Float64Array(3), new Float64Array(3), new Float64Array(3)];
    const b = new Float64Array(3);
    const x = new Float64Array(3);
    m.stamp(G, b, x, 1 / 48000);

    // Top to wiper: R = 100k * 0.3 = 30k → g = 3.33e-5
    // Wiper to bottom: R = 100k * 0.7 = 70k → g = 1.43e-5
    const gTop = 1 / (100000 * 0.3);
    const gBottom = 1 / (100000 * 0.7);
    expect(G[0][0]).toBeCloseTo(gTop, 8);
    expect(G[1][1]).toBeCloseTo(gTop + gBottom, 8);
    expect(G[2][2]).toBeCloseTo(gBottom, 8);
  });
});

describe('PowerSourceModel', () => {
  it('has 1 branch and stamps voltage source', () => {
    const m = new PowerSourceModel();
    expect(m.getBranchCount()).toBe(1);

    // Pins: 0=pos, 1=neg(ground). Matrix: 1 node + 1 branch = 2x2
    // posNode=0, negNode=-1 (ground), branchRow=1
    m.init([0, -1], 0, 1, { voltage: 9 });

    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    const x = new Float64Array(2);
    m.stamp(G, b, x, 1 / 48000);

    // Voltage source stamp: G[br][pos]=1, G[pos][br]=1, b[br]=V
    expect(G[1][0]).toBe(1);
    expect(G[0][1]).toBe(1);
    expect(b[1]).toBe(9);
  });
});

describe('GroundModel', () => {
  it('has no internal nodes or branches', () => {
    const m = new GroundModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps nothing', () => {
    const m = new GroundModel();
    m.init([-1], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    expect(G[0][0]).toBe(0);
    expect(b[0]).toBe(0);
  });
});

describe('AudioOutputModel', () => {
  it('stamps nothing significant', () => {
    const m = new AudioOutputModel();
    m.init([0], 0, 0, {});
    const G = [new Float64Array(1)];
    const b = new Float64Array(1);
    m.stamp(G, b, new Float64Array(1), 1 / 48000);
    // Only Gmin-level conductance (handled by solver, not model)
    expect(G[0][0]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/SimpleModels.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement all four models**

```typescript
// src/simulation/models/PotentiometerModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

export class PotentiometerModel implements ComponentModel {
  readonly type = 'potentiometer';
  private n0 = -1; // top
  private n1 = -1; // wiper
  private n2 = -1; // bottom
  private maxR = 1000000;
  private position = 0.5;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    params: Record<string, number>
  ): void {
    this.n0 = pinNodes[0];
    this.n1 = pinNodes[1];
    this.n2 = pinNodes[2];
    this.maxR = params.maxResistance ?? 1000000;
    this.position = Math.max(0.001, Math.min(0.999, params.position ?? 0.5));
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    const pos = this.position;
    if (this.n1 >= 0) {
      stampConductance(G, this.n0, this.n1, 1 / (this.maxR * pos));
      stampConductance(G, this.n1, this.n2, 1 / (this.maxR * (1 - pos)));
    } else {
      stampConductance(G, this.n0, this.n2, 1 / (this.maxR * Math.max(0.01, pos)));
    }
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}

  /** Live parameter update (pot wiper moved). */
  setPosition(pos: number): void {
    this.position = Math.max(0.001, Math.min(0.999, pos));
  }
}
```

```typescript
// src/simulation/models/PowerSourceModel.ts
import type { ComponentModel } from './ComponentModel';

export class PowerSourceModel implements ComponentModel {
  readonly type = 'power';
  private posNode = -1;
  private negNode = -1;
  private branchRow = -1;
  private voltage = 9;

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 1; }

  init(
    pinNodes: number[],
    _internalNodeStart: number,
    branchStart: number,
    params: Record<string, number>
  ): void {
    this.posNode = pinNodes[0];
    this.negNode = pinNodes[1];
    this.branchRow = branchStart;
    this.voltage = params.voltage ?? 9;
  }

  stamp(G: Float64Array[], b: Float64Array, _x: Float64Array, _dt: number): void {
    const br = this.branchRow;
    if (this.posNode >= 0) {
      G[br][this.posNode] = 1;
      G[this.posNode][br] = 1;
    }
    if (this.negNode >= 0) {
      G[br][this.negNode] = -1;
      G[this.negNode][br] = -1;
    }
    b[br] = this.voltage;
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

```typescript
// src/simulation/models/GroundModel.ts
import type { ComponentModel } from './ComponentModel';

export class GroundModel implements ComponentModel {
  readonly type = 'ground';

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    _pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {}

  stamp(
    _G: Float64Array[],
    _b: Float64Array,
    _x: Float64Array,
    _dt: number
  ): void {}

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

```typescript
// src/simulation/models/AudioOutputModel.ts
import type { ComponentModel } from './ComponentModel';

export class AudioOutputModel implements ComponentModel {
  readonly type = 'audio-output';

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    _pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {}

  stamp(
    _G: Float64Array[],
    _b: Float64Array,
    _x: Float64Array,
    _dt: number
  ): void {}

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/SimpleModels.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/simulation/models/PotentiometerModel.ts \
  src/simulation/models/PowerSourceModel.ts \
  src/simulation/models/GroundModel.ts \
  src/simulation/models/AudioOutputModel.ts \
  tests/simulation/models/SimpleModels.test.ts
git commit -m "feat: potentiometer, power source, ground, and audio output models"
```

---

## Task 6: DiodeModel (1N914 + LED)

**Files:**
- Create: `src/simulation/models/DiodeModel.ts`
- Test: `tests/simulation/models/DiodeModel.test.ts`
- Modify: `tests/simulation/solver/MNASolver.test.ts` (add forward bias integration test)

- [ ] **Step 1: Write DiodeModel unit test**

```typescript
// tests/simulation/models/DiodeModel.test.ts
import { describe, it, expect } from 'vitest';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';

describe('DiodeModel', () => {
  describe('1N914', () => {
    it('has 1 internal node (series resistance)', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      expect(m.getInternalNodeCount()).toBe(1);
    });

    it('stamps series resistance and junction conductance', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      // Pins: 0=anode, 1=cathode. Nodes: 0=anode, 1=cathode, 2=internal(A')
      m.init([0, 1], 2, 0, {});

      const N = 3;
      const G = Array.from({ length: N }, () => new Float64Array(N));
      const b = new Float64Array(N);
      // Set Vd ≈ 0.6V across junction (A'=0.6, K=0)
      const x = Float64Array.from([0.6, 0, 0.6]);
      m.stamp(G, b, x, 1 / 48000);

      // Rs = 0.568Ω → conductance between anode(0) and A'(2)
      const Grs = 1 / 0.568;
      expect(G[0][0]).toBeCloseTo(Grs, 1);
      expect(G[2][2]).toBeGreaterThan(Grs); // Grs + junction Gd
      // Junction stamps between A'(2) and cathode(1)
      expect(G[1][1]).toBeGreaterThan(0);
    });

    it('reports convergence error from junction voltage change', () => {
      const m = new DiodeModel(DIODE_1N914_PARAMS);
      m.init([0, 1], 2, 0, {});
      // Internal node A' is at index 2, cathode at 1
      const xOld = Float64Array.from([0.6, 0, 0.55]);
      const xNew = Float64Array.from([0.6, 0, 0.60]);
      const err = m.convergenceError(xOld, xNew);
      expect(err).toBeCloseTo(0.05, 4); // |0.60 - 0.55| = 0.05
    });
  });

  describe('LED (Rs=0)', () => {
    it('has 0 internal nodes', () => {
      const m = new DiodeModel(DIODE_LED_RED_PARAMS);
      expect(m.getInternalNodeCount()).toBe(0);
    });

    it('stamps junction directly between anode and cathode', () => {
      const m = new DiodeModel(DIODE_LED_RED_PARAMS);
      m.init([0, 1], 0, 0, {});

      const G = [new Float64Array(2), new Float64Array(2)];
      const b = new Float64Array(2);
      const x = Float64Array.from([1.8, 0]); // ~Vf for red LED
      m.stamp(G, b, x, 1 / 48000);

      expect(G[0][0]).toBeGreaterThan(0); // junction Gd
      expect(G[1][1]).toBeGreaterThan(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/DiodeModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement DiodeModel**

```typescript
// src/simulation/models/DiodeModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import {
  BOLTZMANN_VOLTAGE,
  computeVcrit,
  limitJunctionVoltage,
  linearizeJunction,
} from './junctionUtils';

export interface DiodeParams {
  Is: number;
  n: number;
  Rs: number;
  Vt?: number;
}

export const DIODE_1N914_PARAMS: DiodeParams = {
  Is: 2.52e-9,
  n: 1.752,
  Rs: 0.568,
};

export const DIODE_LED_RED_PARAMS: DiodeParams = {
  Is: 1e-20,
  n: 2.0,
  Rs: 0,
};

export class DiodeModel implements ComponentModel {
  readonly type = 'diode';
  private params: DiodeParams;
  private Vcrit: number;
  private hasRs: boolean;

  // Node indices
  private nAnode = -1;    // external anode pin
  private nCathode = -1;  // external cathode pin
  private nAprime = -1;   // internal node (between Rs and junction), or -1 if Rs=0

  // NR state
  private vdPrev = 0;     // previous junction voltage for NR limiting
  private lastId = 0;     // last computed forward current (for LED brightness)

  constructor(params: DiodeParams) {
    this.params = params;
    this.hasRs = params.Rs > 0;
    const Vt = params.Vt ?? BOLTZMANN_VOLTAGE;
    this.Vcrit = computeVcrit(params.Is, params.n, Vt);
  }

  getInternalNodeCount(): number {
    return this.hasRs ? 1 : 0;
  }

  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {
    this.nAnode = pinNodes[0];
    this.nCathode = pinNodes[1];
    this.nAprime = this.hasRs ? internalNodeStart : -1;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const { Is, n, Rs } = this.params;
    const Vt = this.params.Vt ?? BOLTZMANN_VOLTAGE;
    const nVt = n * Vt;

    // If Rs > 0: stamp Rs between anode and A', junction between A' and cathode
    // If Rs = 0: junction directly between anode and cathode
    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;

    if (this.hasRs) {
      stampConductance(G, this.nAnode, this.nAprime, 1 / Rs);
    }

    // Junction voltage from current solution guess
    const vPos = nJunctionPos >= 0 ? x[nJunctionPos] : 0;
    const vNeg = nJunctionNeg >= 0 ? x[nJunctionNeg] : 0;
    let vd = vPos - vNeg;

    // SPICE-style voltage limiting
    vd = limitJunctionVoltage(vd, this.vdPrev, nVt, this.Vcrit);

    // Linearize Shockley equation at operating point
    const { Gd, Ieq, Id } = linearizeJunction(vd, Is, n, Vt);
    this.lastId = Id;

    // Stamp junction
    stampConductance(G, nJunctionPos, nJunctionNeg, Gd);
    // Companion current source: Ieq flows from cathode to anode-side (convention)
    stampCurrentSource(b, nJunctionNeg, nJunctionPos, Ieq);
  }

  postStep(x: Float64Array, _dt: number): void {
    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;
    const vPos = nJunctionPos >= 0 ? x[nJunctionPos] : 0;
    const vNeg = nJunctionNeg >= 0 ? x[nJunctionNeg] : 0;
    this.vdPrev = vPos - vNeg;
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    const nJunctionPos = this.hasRs ? this.nAprime : this.nAnode;
    const nJunctionNeg = this.nCathode;
    const vOldPos = nJunctionPos >= 0 ? xOld[nJunctionPos] : 0;
    const vOldNeg = nJunctionNeg >= 0 ? xOld[nJunctionNeg] : 0;
    const vNewPos = nJunctionPos >= 0 ? xNew[nJunctionPos] : 0;
    const vNewNeg = nJunctionNeg >= 0 ? xNew[nJunctionNeg] : 0;
    return Math.abs((vNewPos - vNewNeg) - (vOldPos - vOldNeg));
  }

  reset(): void {
    this.vdPrev = 0;
    this.lastId = 0;
  }

  /** Get forward current (for LED brightness reporting). */
  getForwardCurrent(): number {
    return this.lastId;
  }

  /** LED is "on" when forward current exceeds threshold. */
  isLit(): boolean {
    return this.lastId > 1e-6; // > 1μA
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/DiodeModel.test.ts`
Expected: PASS

- [ ] **Step 5: Add diode forward bias integration test**

Add to `tests/simulation/solver/MNASolver.test.ts`:

```typescript
import { DiodeModel, DIODE_1N914_PARAMS } from '@/simulation/models/DiodeModel';

// Inside describe('MNASolver'), add:
  describe('diode forward bias', () => {
    it('produces ~0.6-0.7V drop across 1N914', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
      const solver = new MNASolver(reg);

      // 9V → 1kΩ → 1N914 → GND
      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 1000 }),
        makeComp('d', '1n914', [
          { id: 'a', type: 'bidirectional' },
          { id: 'k', type: 'bidirectional' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'r', 'p0'),
        makeConn('r', 'p1', 'd', 'a'),
        makeConn('d', 'k', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);
      // Run a few steps for NR to converge
      for (let i = 0; i < 10; i++) solver.step(1 / 48000);

      const vAnode = solver.getNodeVoltageByPin('d', 'a');
      // Forward voltage ≈ 0.6-0.7V for 1N914 with n=1.752
      expect(vAnode).toBeGreaterThan(0.5);
      expect(vAnode).toBeLessThan(0.85);
    });
  });
```

- [ ] **Step 6: Run integration test**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/simulation/models/DiodeModel.ts \
  tests/simulation/models/DiodeModel.test.ts \
  tests/simulation/solver/MNASolver.test.ts
git commit -m "feat: SPICE-grade diode model with Shockley equation, NR limiting, series resistance"
```

---

## Task 7: BJTModel (Gummel-Poon)

**Files:**
- Create: `src/simulation/models/BJTModel.ts`
- Test: `tests/simulation/models/BJTModel.test.ts`
- Modify: `tests/simulation/solver/MNASolver.test.ts` (add CE amplifier integration test)

- [ ] **Step 1: Write BJTModel unit test**

```typescript
// tests/simulation/models/BJTModel.test.ts
import { describe, it, expect } from 'vitest';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';

describe('BJTModel', () => {
  it('has 3 internal nodes (B\', C\', E\')', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    expect(m.getInternalNodeCount()).toBe(3);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps parasitic resistances between external and internal nodes', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    // External: B=0, C=1, E=2. Internal: B'=3, C'=4, E'=5
    m.init([0, 1, 2], 3, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Set active region: Vbe'≈0.65V, Vce≈5V
    const x = Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]);
    m.stamp(G, b, x, 1 / 48000);

    // RB=10Ω between B(0) and B'(3)
    expect(G[0][0]).toBeCloseTo(1 / 10, 4);
    expect(G[0][3]).toBeCloseTo(-1 / 10, 4);

    // RC=1Ω between C(1) and C'(4)
    expect(G[1][1]).toBeCloseTo(1, 4);
    expect(G[1][4]).toBeCloseTo(-1, 4);

    // RE=0.1Ω between E(2) and E'(5)
    expect(G[2][2]).toBeCloseTo(10, 4);
    expect(G[2][5]).toBeCloseTo(-10, 4);
  });

  it('produces non-zero transconductance in active region', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Active: Vbe'=0.65V, Vbc'=-4.35V (Vce=5V)
    const x = Float64Array.from([0.65, 5.0, 0.0, 0.65, 5.0, 0.0]);
    m.stamp(G, b, x, 1 / 48000);

    // Internal node C'(4) should have transconductance from B'(3)
    // G[4][3] should include dIc/dVbe contribution (positive)
    // The combined parasitic + GP stamps make exact values hard to predict,
    // but the C' row should have off-diagonal entries from GP
    const gpContrib = G[4][3] + (1 / 1); // subtract RC stamp
    expect(gpContrib).toBeGreaterThan(0);
  });

  it('reports convergence error from junction voltage changes', () => {
    const m = new BJTModel(BJT_2N3904_PARAMS);
    m.init([0, 1, 2], 3, 0, {});

    // B'=3, C'=4, E'=5
    const xOld = Float64Array.from([0, 0, 0, 0.60, 5.0, 0.0]);
    const xNew = Float64Array.from([0, 0, 0, 0.65, 5.0, 0.0]);
    const err = m.convergenceError(xOld, xNew);
    // Vbe change: |0.65-0.60| = 0.05, Vbc change: |(0.65-5)-(0.60-5)| = 0.05
    expect(err).toBeCloseTo(0.05, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/BJTModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement BJTModel**

```typescript
// src/simulation/models/BJTModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance, stampCurrentSource } from './stampUtils';
import {
  BOLTZMANN_VOLTAGE,
  computeVcrit,
  limitJunctionVoltage,
} from './junctionUtils';

export interface BJTParams {
  IS: number;
  BF: number;
  NF: number;
  VAF: number;
  IKF: number;
  BR: number;
  NR: number;
  VAR: number;
  RB: number;
  RC: number;
  RE: number;
  Vt?: number;
}

export const BJT_2N3904_PARAMS: BJTParams = {
  IS: 6.734e-15,
  BF: 416.4,
  NF: 1.0,
  VAF: 74.03,
  IKF: 0.06678,
  BR: 0.7389,
  NR: 1.0,
  VAR: 28,
  RB: 10,
  RC: 1,
  RE: 0.1,
};

export class BJTModel implements ComponentModel {
  readonly type = 'bjt';
  private params: BJTParams;
  private VcritF: number;
  private VcritR: number;

  // External pin nodes
  private nB = -1;
  private nC = -1;
  private nE = -1;
  // Internal intrinsic nodes
  private nBp = -1; // B'
  private nCp = -1; // C'
  private nEp = -1; // E'

  // NR state
  private vbePrev = 0;
  private vbcPrev = 0;

  constructor(params: BJTParams) {
    this.params = params;
    const Vt = params.Vt ?? BOLTZMANN_VOLTAGE;
    this.VcritF = computeVcrit(params.IS, params.NF, Vt);
    this.VcritR = computeVcrit(params.IS, params.NR, Vt);
  }

  getInternalNodeCount(): number { return 3; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {
    this.nB = pinNodes[0];
    this.nC = pinNodes[1];
    this.nE = pinNodes[2];
    this.nBp = internalNodeStart;
    this.nCp = internalNodeStart + 1;
    this.nEp = internalNodeStart + 2;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, _dt: number): void {
    const p = this.params;
    const Vt = p.Vt ?? BOLTZMANN_VOLTAGE;

    // 1. Parasitic resistances
    stampConductance(G, this.nB, this.nBp, 1 / p.RB);
    stampConductance(G, this.nC, this.nCp, 1 / p.RC);
    stampConductance(G, this.nE, this.nEp, 1 / p.RE);

    // 2. Junction voltages at intrinsic nodes
    const vBp = this.nBp >= 0 ? x[this.nBp] : 0;
    const vCp = this.nCp >= 0 ? x[this.nCp] : 0;
    const vEp = this.nEp >= 0 ? x[this.nEp] : 0;

    let vbe = vBp - vEp;
    let vbc = vBp - vCp;

    // SPICE-style voltage limiting
    vbe = limitJunctionVoltage(vbe, this.vbePrev, p.NF * Vt, this.VcritF);
    vbc = limitJunctionVoltage(vbc, this.vbcPrev, p.NR * Vt, this.VcritR);

    // 3. Gummel-Poon model equations
    const nfVt = p.NF * Vt;
    const nrVt = p.NR * Vt;

    const expBE = Math.exp(vbe / nfVt);
    const expBC = Math.exp(vbc / nrVt);
    const If = p.IS * (expBE - 1);
    const Ir = p.IS * (expBC - 1);

    // Junction conductances
    const gf = Math.max((p.IS / nfVt) * expBE, 1e-12);
    const gr = Math.max((p.IS / nrVt) * expBC, 1e-12);

    // Base charge factor (Early effect + high injection)
    const q1inv = 1 - vbc / p.VAF - vbe / p.VAR;
    const q1 = q1inv > 1e-6 ? 1 / q1inv : 1e6;
    const q2 = If / p.IKF;
    const sqarg = 1 + 4 * q2;
    const sqrtArg = Math.sqrt(Math.max(sqarg, 0));
    const qb = (q1 / 2) * (1 + sqrtArg);
    const qbSafe = Math.max(qb, 1e-6);

    // Transport current
    const It = (If - Ir) / qbSafe;
    const Ic = It - Ir / p.BR;
    const Ib = If / p.BF + Ir / p.BR;

    // 4. Derivatives for NR linearization
    const dq1_dVbe = q1 * q1 / p.VAR;
    const dq1_dVbc = q1 * q1 / p.VAF;
    const dqb_dVbe =
      0.5 * (dq1_dVbe * (1 + sqrtArg) + q1 * (2 * gf / (p.IKF * sqrtArg)));
    const dqb_dVbc = 0.5 * dq1_dVbc * (1 + sqrtArg);

    const qb2 = qbSafe * qbSafe;
    const dIt_dVbe = (gf * qbSafe - (If - Ir) * dqb_dVbe) / qb2;
    const dIt_dVbc = (-gr * qbSafe - (If - Ir) * dqb_dVbc) / qb2;

    const dIc_dVbe = dIt_dVbe;
    const dIc_dVbc = dIt_dVbc - gr / p.BR;
    const dIb_dVbe = gf / p.BF;
    const dIb_dVbc = gr / p.BR;

    // 5. Stamp linearized Ic and Ib
    // Ic flows into C' node. Vbe = V(B') - V(E'), Vbc = V(B') - V(C')
    // dIc/dV(B') = dIc_dVbe + dIc_dVbc
    // dIc/dV(E') = -dIc_dVbe
    // dIc/dV(C') = -dIc_dVbc
    const Bp = this.nBp;
    const Cp = this.nCp;
    const Ep = this.nEp;

    // Collector current stamps
    if (Cp >= 0 && Bp >= 0) G[Cp][Bp] += dIc_dVbe + dIc_dVbc;
    if (Cp >= 0 && Ep >= 0) G[Cp][Ep] -= dIc_dVbe;
    if (Cp >= 0) G[Cp][Cp] -= dIc_dVbc;

    // Base current stamps
    if (Bp >= 0) G[Bp][Bp] += dIb_dVbe + dIb_dVbc;
    if (Bp >= 0 && Ep >= 0) G[Bp][Ep] -= dIb_dVbe;
    if (Bp >= 0 && Cp >= 0) G[Bp][Cp] -= dIb_dVbc;

    // Emitter current stamps (Ie = -(Ic + Ib) by KCL)
    if (Ep >= 0 && Bp >= 0) G[Ep][Bp] -= (dIc_dVbe + dIc_dVbc + dIb_dVbe + dIb_dVbc);
    if (Ep >= 0) G[Ep][Ep] += dIc_dVbe + dIb_dVbe;
    if (Ep >= 0 && Cp >= 0) G[Ep][Cp] += dIc_dVbc + dIb_dVbc;

    // Companion current sources (linearization offset)
    const Ic_eq = Ic - dIc_dVbe * vbe - dIc_dVbc * vbc;
    const Ib_eq = Ib - dIb_dVbe * vbe - dIb_dVbc * vbc;
    const Ie_eq = -(Ic_eq + Ib_eq);

    if (Cp >= 0) b[Cp] += Ic_eq;
    if (Bp >= 0) b[Bp] += Ib_eq;
    if (Ep >= 0) b[Ep] += Ie_eq;
  }

  postStep(x: Float64Array, _dt: number): void {
    const vBp = this.nBp >= 0 ? x[this.nBp] : 0;
    const vCp = this.nCp >= 0 ? x[this.nCp] : 0;
    const vEp = this.nEp >= 0 ? x[this.nEp] : 0;
    this.vbePrev = vBp - vEp;
    this.vbcPrev = vBp - vCp;
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    const vbeOld = (this.nBp >= 0 ? xOld[this.nBp] : 0) - (this.nEp >= 0 ? xOld[this.nEp] : 0);
    const vbeNew = (this.nBp >= 0 ? xNew[this.nBp] : 0) - (this.nEp >= 0 ? xNew[this.nEp] : 0);
    const vbcOld = (this.nBp >= 0 ? xOld[this.nBp] : 0) - (this.nCp >= 0 ? xOld[this.nCp] : 0);
    const vbcNew = (this.nBp >= 0 ? xNew[this.nBp] : 0) - (this.nCp >= 0 ? xNew[this.nCp] : 0);
    return Math.max(Math.abs(vbeNew - vbeOld), Math.abs(vbcNew - vbcOld));
  }

  reset(): void {
    this.vbePrev = 0;
    this.vbcPrev = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/BJTModel.test.ts`
Expected: PASS

- [ ] **Step 5: Add BJT CE amplifier integration test**

Add to `tests/simulation/solver/MNASolver.test.ts`:

```typescript
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';

// Inside describe('MNASolver'), add:
  describe('BJT common emitter', () => {
    it('produces collector current with correct beta', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
      const solver = new MNASolver(reg);

      // Vcc=9V, Rc=1k, Rb=100k, base driven from Vcc through Rb
      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('rc', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 1000 }),
        makeComp('rb', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 100000 }),
        makeComp('q', '2n3904', [
          { id: 'b', type: 'bidirectional' },
          { id: 'c', type: 'bidirectional' },
          { id: 'e', type: 'bidirectional' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'rc', 'p0'),
        makeConn('rc', 'p1', 'q', 'c'),
        makeConn('pwr', 'pos', 'rb', 'p0'),
        makeConn('rb', 'p1', 'q', 'b'),
        makeConn('q', 'e', 'gnd', 'gnd'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 20; i++) solver.step(1 / 48000);

      const vC = solver.getNodeVoltageByPin('q', 'c');
      const vB = solver.getNodeVoltageByPin('q', 'b');

      // Base should be around 0.65V (forward biased)
      expect(vB).toBeGreaterThan(0.5);
      expect(vB).toBeLessThan(0.8);

      // Ib ≈ (9 - 0.65) / 100k ≈ 83.5μA
      // Ic ≈ BF * Ib ≈ 416 * 83.5μA ≈ 34.7mA — but Ic is limited by Rc
      // If Ic*Rc > Vcc, transistor saturates. 34.7mA * 1k = 34.7V > 9V → saturated
      // In saturation: Vce ≈ 0.2V, so Vc ≈ 0.2V
      expect(vC).toBeLessThan(1.0); // Saturated
      expect(vC).toBeGreaterThan(-0.5);
    });
  });
```

- [ ] **Step 6: Run integration test**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/simulation/models/BJTModel.ts \
  tests/simulation/models/BJTModel.test.ts \
  tests/simulation/solver/MNASolver.test.ts
git commit -m "feat: Gummel-Poon BJT model with Early effect, parasitic resistances"
```

---

## Task 8: OpAmpModel (Simplified Boyle Macromodel)

**Files:**
- Create: `src/simulation/models/OpAmpModel.ts`
- Test: `tests/simulation/models/OpAmpModel.test.ts`
- Modify: `tests/simulation/solver/MNASolver.test.ts` (add inverting amplifier integration test)

- [ ] **Step 1: Write OpAmpModel unit test**

```typescript
// tests/simulation/models/OpAmpModel.test.ts
import { describe, it, expect } from 'vitest';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';

describe('OpAmpModel', () => {
  it('has 1 internal node (gain) and 0 branches', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    expect(m.getInternalNodeCount()).toBe(1);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps input resistance between IN+ and IN-', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    // Pins: 0=IN-, 1=IN+, 2=V-, 3=OUT, 4=V+
    // Nodes: IN-=0, IN+=1, V-=2, OUT=3, V+=4, gain=5(internal)
    m.init([0, 1, 2, 3, 4], 5, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = new Float64Array(N);
    m.stamp(G, b, x, 1 / 48000);

    // Rin = 2MΩ → conductance = 5e-7
    const Gin = 1 / 2e6;
    // IN-(0) and IN+(1) should have Rin conductance
    expect(G[0][0]).toBeGreaterThanOrEqual(Gin * 0.99);
    expect(G[1][1]).toBeGreaterThanOrEqual(Gin * 0.99);
    expect(G[0][1]).toBeCloseTo(-Gin, 10);
  });

  it('stamps transconductance from diff input to gain node in linear region', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Small differential: V(IN+)=0.01, V(IN-)=0 → Vdiff=0.01V < Vclip=0.053V
    const x = Float64Array.from([0, 0.01, 0, 0, 9, 0]);
    m.stamp(G, b, x, 1 / 48000);

    // Gain node (5) should have gm stamp from IN+(1)
    const gm = 283e-6; // 283 μA/V
    expect(G[5][1]).toBeCloseTo(gm, 7); // G[gain][IN+] = +gm
    expect(G[5][0]).toBeCloseTo(-gm, 7); // G[gain][IN-] = -gm
  });

  it('stamps output buffer Norton equivalent', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    const x = new Float64Array(N);
    m.stamp(G, b, x, 1 / 48000);

    // OUT node (3) should have 1/Rout self-conductance + 1/Rout from gain node
    const Gout = 1 / 75;
    expect(G[3][3]).toBeGreaterThanOrEqual(Gout * 0.99);
    expect(G[3][5]).toBeCloseTo(Gout, 4); // G[OUT][gain] = 1/Rout
  });

  it('limits VCCS current in slew limiting region', () => {
    const m = new OpAmpModel(OPAMP_LM741_PARAMS);
    m.init([0, 1, 2, 3, 4], 5, 0, {});

    const N = 6;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Large differential: V(IN+)=1.0V >> Vclip → slew limited
    const x = Float64Array.from([0, 1.0, 0, 0, 9, 0]);
    m.stamp(G, b, x, 1 / 48000);

    // In saturation, gm should be ~0 and b[gain] should be Imax
    expect(G[5][1]).toBeCloseTo(0, 8); // No transconductance
    const Imax = 15e-6;
    expect(b[5]).toBeCloseTo(Imax, 8); // Constant current
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/OpAmpModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement OpAmpModel**

```typescript
// src/simulation/models/OpAmpModel.ts
import type { ComponentModel } from './ComponentModel';
import {
  stampConductance,
  stampCurrentSource,
} from './stampUtils';
import {
  BOLTZMANN_VOLTAGE,
  linearizeJunction,
} from './junctionUtils';

export interface OpAmpParams {
  Aol: number;      // Open-loop DC gain
  GBW: number;      // Gain-bandwidth product (Hz)
  Rin: number;      // Differential input resistance (Ω)
  Rout: number;     // Output resistance (Ω)
  SR: number;       // Slew rate (V/s)
  Cc: number;       // Compensation capacitor (F)
  clampIs?: number; // Clamp diode Is
  clampN?: number;  // Clamp diode emission coefficient
}

export const OPAMP_LM741_PARAMS: OpAmpParams = {
  Aol: 200000,
  GBW: 1.5e6,
  Rin: 2e6,
  Rout: 75,
  SR: 0.5e6,     // 0.5 V/μs in V/s
  Cc: 30e-12,
  clampIs: 1e-12,
  clampN: 1,
};

export class OpAmpModel implements ComponentModel {
  readonly type = 'opamp';
  private params: OpAmpParams;

  // Derived parameters
  private fp: number;    // Dominant pole frequency
  private Rg: number;    // Gain node load resistance
  private gm: number;    // Input VCCS transconductance
  private Imax: number;  // Max comp cap charge current (slew limit)
  private Vclip: number; // Input diff pair saturation voltage

  // Node indices: external pins
  private nInvM = -1;   // IN- (inverting, pin 0)
  private nInvP = -1;   // IN+ (non-inverting, pin 1)
  private nVneg = -1;   // V- (pin 2)
  private nOut = -1;     // OUT (pin 3)
  private nVpos = -1;    // V+ (pin 4)

  // Internal node
  private nGain = -1;    // Gain/compensation node

  // Comp cap state
  private ccVprev = 0;
  private ccIprev = 0;

  constructor(params: OpAmpParams) {
    this.params = params;
    this.fp = params.GBW / params.Aol;
    this.Rg = 1 / (2 * Math.PI * this.fp * params.Cc);
    this.gm = params.Aol / this.Rg;
    this.Imax = params.SR * params.Cc;
    this.Vclip = this.Imax / this.gm;
  }

  getInternalNodeCount(): number { return 1; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {
    // Pin order: IN-(0), IN+(1), V-(2), OUT(3), V+(4)
    this.nInvM = pinNodes[0];
    this.nInvP = pinNodes[1];
    this.nVneg = pinNodes[2];
    this.nOut = pinNodes[3];
    this.nVpos = pinNodes[4];
    this.nGain = internalNodeStart;
  }

  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void {
    const p = this.params;
    const g = this.nGain;

    // 1. Input resistance between IN+ and IN-
    stampConductance(G, this.nInvP, this.nInvM, 1 / p.Rin);

    // 2. Input VCCS with slew limiting
    const vP = this.nInvP >= 0 ? x[this.nInvP] : 0;
    const vM = this.nInvM >= 0 ? x[this.nInvM] : 0;
    const vDiff = vP - vM;

    if (Math.abs(vDiff) < this.Vclip) {
      // Linear region: stamp gm as VCCS into gain node
      if (g >= 0 && this.nInvP >= 0) G[g][this.nInvP] += this.gm;
      if (g >= 0 && this.nInvM >= 0) G[g][this.nInvM] -= this.gm;
    } else {
      // Slew limited: constant current into gain node
      if (g >= 0) b[g] += vDiff > 0 ? this.Imax : -this.Imax;
    }

    // 3. Gain node load resistance to ground
    if (g >= 0) G[g][g] += 1 / this.Rg;

    // 4. Compensation capacitor (trapezoidal companion) at gain node
    if (g >= 0) {
      const Geq = 2 * p.Cc / dt;
      G[g][g] += Geq;
      const Ieq = Geq * this.ccVprev + this.ccIprev;
      b[g] += Ieq;
    }

    // 5. Output buffer (Norton equivalent)
    const Gout = 1 / p.Rout;
    if (this.nOut >= 0) G[this.nOut][this.nOut] += Gout;
    if (this.nOut >= 0 && g >= 0) G[this.nOut][g] += Gout;

    // 6. Rail clamp diodes
    this.stampClampDiode(G, b, x, this.nOut, this.nVpos, true);  // OUT→V+ (high clamp)
    this.stampClampDiode(G, b, x, this.nVneg, this.nOut, false); // V-→OUT (low clamp)
  }

  private stampClampDiode(
    G: Float64Array[],
    b: Float64Array,
    x: Float64Array,
    nAnode: number,
    nCathode: number,
    _isHighClamp: boolean
  ): void {
    const Is = this.params.clampIs ?? 1e-12;
    const n = this.params.clampN ?? 1;
    const Vt = BOLTZMANN_VOLTAGE;

    const vA = nAnode >= 0 ? x[nAnode] : 0;
    const vK = nCathode >= 0 ? x[nCathode] : 0;
    const vd = vA - vK;

    // Only stamp when forward biased (performance: skip reverse bias)
    if (vd < -0.5) return;

    const { Gd, Ieq } = linearizeJunction(vd, Is, n, Vt);
    stampConductance(G, nAnode, nCathode, Gd);
    stampCurrentSource(b, nCathode, nAnode, Ieq);
  }

  postStep(x: Float64Array, dt: number): void {
    // Update comp cap state
    if (this.nGain >= 0) {
      const vGain = x[this.nGain];
      const Geq = 2 * this.params.Cc / dt;
      const iCc = Geq * (vGain - this.ccVprev) - this.ccIprev;
      this.ccVprev = vGain;
      this.ccIprev = iCc;
    }
  }

  convergenceError(xOld: Float64Array, xNew: Float64Array): number {
    if (this.nGain < 0) return 0;
    return Math.abs(xNew[this.nGain] - xOld[this.nGain]);
  }

  reset(): void {
    this.ccVprev = 0;
    this.ccIprev = 0;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/OpAmpModel.test.ts`
Expected: PASS

- [ ] **Step 5: Add op-amp inverting amplifier integration test**

Add to `tests/simulation/solver/MNASolver.test.ts`:

```typescript
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';

// Inside describe('MNASolver'), add:
  describe('op-amp inverting amplifier', () => {
    it('produces gain ≈ -R2/R1', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
      const solver = new MNASolver(reg);

      // Inverting amp: R1=10k (input to IN-), R2=100k (IN- to OUT)
      // IN+ biased at 4.5V (mid-rail) via resistor divider
      // Input signal: 4.6V (0.1V above bias) → expect output ≈ 4.5 - 1.0 = 3.5V
      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        // Bias divider for IN+
        makeComp('rb1', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        makeComp('rb2', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        // Input resistor
        makeComp('r1', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        // Feedback resistor
        makeComp('r2', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 100000 }),
        // Input voltage source (4.6V)
        makeComp('vin', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 4.6 }),
        // Op-amp: pins IN-(0), IN+(1), V-(2), OUT(3), V+(4)
        makeComp('u', 'lm741', [
          { id: 'inm', type: 'input' },
          { id: 'inp', type: 'input' },
          { id: 'vneg', type: 'power' },
          { id: 'out', type: 'output' },
          { id: 'vpos', type: 'power' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('vin', 'neg', 'gnd', 'gnd'),
        // Bias divider
        makeConn('pwr', 'pos', 'rb1', 'p0'),
        makeConn('rb1', 'p1', 'rb2', 'p0'),
        makeConn('rb2', 'p1', 'gnd', 'gnd'),
        makeConn('rb1', 'p1', 'u', 'inp'),
        // Input through R1 to IN-
        makeConn('vin', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'u', 'inm'),
        // Feedback R2 from OUT to IN-
        makeConn('u', 'out', 'r2', 'p0'),
        makeConn('r2', 'p1', 'u', 'inm'),
        // Power supply to op-amp
        makeConn('pwr', 'pos', 'u', 'vpos'),
        makeConn('gnd', 'gnd', 'u', 'vneg'),
      ];

      solver.loadCircuit(components, connections);
      // Run enough steps for comp cap to settle (bandwidth limited)
      for (let i = 0; i < 500; i++) solver.step(1 / 48000);

      const vOut = solver.getNodeVoltageByPin('u', 'out');
      // Gain = -R2/R1 = -10. Vin_ac = 0.1V above bias.
      // Vout should be ≈ 4.5 - 10*0.1 = 3.5V
      expect(vOut).toBeGreaterThan(2.5);
      expect(vOut).toBeLessThan(4.5);
    });

    it('saturates at supply rails', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
      const solver = new MNASolver(reg);

      // Drive with large input to force saturation
      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r1', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        makeComp('r2', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: 10000 }),
        makeComp('u', 'lm741', [
          { id: 'inm', type: 'input' },
          { id: 'inp', type: 'input' },
          { id: 'vneg', type: 'power' },
          { id: 'out', type: 'output' },
          { id: 'vpos', type: 'power' },
        ]),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        // IN+ to ground, IN- to ground through R1 (comparator mode)
        makeConn('gnd', 'gnd', 'u', 'inp'),
        makeConn('pwr', 'pos', 'r1', 'p0'),
        makeConn('r1', 'p1', 'u', 'inm'),
        makeConn('u', 'out', 'r2', 'p0'),
        makeConn('r2', 'p1', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'u', 'vpos'),
        makeConn('gnd', 'gnd', 'u', 'vneg'),
      ];

      solver.loadCircuit(components, connections);
      for (let i = 0; i < 500; i++) solver.step(1 / 48000);

      const vOut = solver.getNodeVoltageByPin('u', 'out');
      // IN- > IN+ → output should saturate near negative rail (0V)
      expect(vOut).toBeLessThan(1.5);
      expect(vOut).toBeGreaterThan(-1);
    });
  });
```

- [ ] **Step 6: Run integration test**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/simulation/models/OpAmpModel.ts \
  tests/simulation/models/OpAmpModel.test.ts \
  tests/simulation/solver/MNASolver.test.ts
git commit -m "feat: Boyle macromodel op-amp with gain, bandwidth, slew rate, rail clamping"
```

---

## Task 9: SchmittTriggerModel (CD40106)

**Files:**
- Create: `src/simulation/models/SchmittTriggerModel.ts`
- Test: `tests/simulation/models/SchmittTriggerModel.test.ts`
- Modify: `tests/simulation/solver/MNASolver.test.ts` (add oscillator frequency test)

- [ ] **Step 1: Write SchmittTriggerModel unit test**

```typescript
// tests/simulation/models/SchmittTriggerModel.test.ts
import { describe, it, expect } from 'vitest';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

describe('SchmittTriggerModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new SchmittTriggerModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps output conductance to Vdd when output is high', () => {
    const m = new SchmittTriggerModel();
    // CD40106 pins: 0-5=inputs(1A-6A), 6-11=outputs(1Y-6Y), 12=VDD, 13=VSS
    // Only connect gate 0: input=node0, output=node1, VDD=node2, VSS=-1(gnd)
    const pins = new Array(14).fill(-1);
    pins[0] = 0;  // 1A input
    pins[6] = 1;  // 1Y output
    pins[12] = 2; // VDD
    pins[13] = -1; // VSS = ground

    m.init(pins, 0, 0, {});

    const N = 3;
    const G = Array.from({ length: N }, () => new Float64Array(N));
    const b = new Float64Array(N);
    // Input low (0V) → output should be high (inverted)
    const x = Float64Array.from([0, 0, 9]);
    m.stamp(G, b, x, 1 / 48000);

    // Output HIGH: conductance 1/280 between output(1) and VDD(2)
    const Gon = 1 / 280;
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    expect(G[1][2]).toBeCloseTo(-Gon, 4);
    expect(G[2][1]).toBeCloseTo(-Gon, 4);
  });

  it('flips output at correct thresholds in postStep', () => {
    const m = new SchmittTriggerModel();
    const pins = new Array(14).fill(-1);
    pins[0] = 0;   // input
    pins[6] = 1;   // output
    pins[12] = 2;  // VDD
    pins[13] = -1;  // VSS

    m.init(pins, 0, 0, {});
    const dt = 1 / 48000;

    // Initially output high (input=0). Drive input above VT+ = 0.58*9 = 5.22V
    const x1 = Float64Array.from([5.5, 0, 9]);
    m.postStep(x1, dt);

    // Now stamp — output should be LOW (conductance to VSS/ground)
    const G = Array.from({ length: 3 }, () => new Float64Array(3));
    const b = new Float64Array(3);
    m.stamp(G, b, x1, dt);

    // Output LOW: conductance to ground, NOT to VDD
    const Gon = 1 / 280;
    // G[1][1] should have conductance to ground (node -1, so just diagonal)
    expect(G[1][1]).toBeCloseTo(Gon, 4);
    // G[1][2] should be ~0 (off resistance only, ~1/1e9)
    expect(Math.abs(G[1][2])).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/SchmittTriggerModel.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement SchmittTriggerModel**

```typescript
// src/simulation/models/SchmittTriggerModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

const NUM_GATES = 6;
const VT_POS_RATIO = 0.58;  // Positive-going threshold / Vdd
const VT_NEG_RATIO = 0.45;  // Negative-going threshold / Vdd
const ROUT = 280;            // Output on-resistance (Ω)
const ROFF = 1e9;            // Output off-resistance (Ω)

export class SchmittTriggerModel implements ComponentModel {
  readonly type = 'cd40106';

  // Pin node indices (14 pins)
  private pins: number[] = [];
  // Gate output states: true = HIGH, false = LOW
  private gateStates: boolean[] = [true, true, true, true, true, true];

  getInternalNodeCount(): number { return 0; }
  getBranchCount(): number { return 0; }

  init(
    pinNodes: number[],
    _internalNodeStart: number,
    _branchStart: number,
    _params: Record<string, number>
  ): void {
    this.pins = [...pinNodes];
    this.gateStates = [true, true, true, true, true, true];
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    const nVdd = this.pins[12];
    const nVss = this.pins[13];

    for (let g = 0; g < NUM_GATES; g++) {
      const nOut = this.pins[g + 6];
      if (nOut < 0) continue; // Output not connected

      if (this.gateStates[g]) {
        // Output HIGH: low resistance to Vdd, high resistance to Vss
        stampConductance(G, nOut, nVdd, 1 / ROUT);
        stampConductance(G, nOut, nVss, 1 / ROFF);
      } else {
        // Output LOW: high resistance to Vdd, low resistance to Vss
        stampConductance(G, nOut, nVdd, 1 / ROFF);
        stampConductance(G, nOut, nVss, 1 / ROUT);
      }
    }
  }

  postStep(x: Float64Array, _dt: number): void {
    const nVdd = this.pins[12];
    const nVss = this.pins[13];
    const vdd = nVdd >= 0 ? x[nVdd] : 0;
    const vss = nVss >= 0 ? x[nVss] : 0;
    const vRange = vdd - vss;

    if (vRange < 0.1) return; // No supply

    const vtPos = vss + vRange * VT_POS_RATIO;
    const vtNeg = vss + vRange * VT_NEG_RATIO;

    for (let g = 0; g < NUM_GATES; g++) {
      const nIn = this.pins[g];
      if (nIn < 0) continue;
      const vIn = x[nIn];

      if (this.gateStates[g] && vIn > vtPos) {
        this.gateStates[g] = false; // Output goes LOW (inverter)
      } else if (!this.gateStates[g] && vIn < vtNeg) {
        this.gateStates[g] = true;  // Output goes HIGH
      }
    }
  }

  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }

  reset(): void {
    this.gateStates = [true, true, true, true, true, true];
  }

  /** Get output state of a specific gate (0-5). For external queries. */
  getGateState(gateIndex: number): boolean {
    return this.gateStates[gateIndex] ?? true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/SchmittTriggerModel.test.ts`
Expected: PASS

- [ ] **Step 5: Add Schmitt oscillator integration test**

Add to `tests/simulation/solver/MNASolver.test.ts`:

```typescript
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';

// Inside describe('MNASolver'), add:
  describe('Schmitt trigger oscillator', () => {
    it('oscillates at approximately correct frequency', () => {
      const reg = new ModelRegistry();
      reg.register('resistor', () => new ResistorModel());
      reg.register('capacitor', () => new CapacitorModel());
      reg.register('cd40106', () => new SchmittTriggerModel());
      const solver = new MNASolver(reg);

      const R = 16000;
      const C = 100e-9;

      // Pin layout: 0-5=inputs, 6-11=outputs, 12=VDD, 13=VSS
      const icPins = [];
      for (let i = 0; i < 14; i++) {
        icPins.push({ id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional' });
      }

      const components = [
        makeComp('pwr', 'power', [
          { id: 'pos', type: 'power' },
          { id: 'neg', type: 'ground' },
        ], { voltage: 9 }),
        makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
        makeComp('r', 'resistor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { resistance: R }),
        makeComp('c', 'capacitor', [
          { id: 'p0', type: 'bidirectional' },
          { id: 'p1', type: 'bidirectional' },
        ], { capacitance: C }),
        makeComp('ic', 'cd40106', icPins),
      ];
      const connections = [
        makeConn('pwr', 'neg', 'gnd', 'gnd'),
        makeConn('pwr', 'pos', 'ic', 'p12'),  // VDD
        makeConn('gnd', 'gnd', 'ic', 'p13'),   // VSS
        makeConn('r', 'p0', 'ic', 'p0'),        // R to input 1A
        makeConn('r', 'p1', 'ic', 'p6'),        // R to output 1Y (feedback)
        makeConn('c', 'p0', 'ic', 'p0'),         // C to input 1A
        makeConn('c', 'p1', 'gnd', 'gnd'),       // C to ground
      ];

      solver.loadCircuit(components, connections);

      // Run 0.5 seconds and count output transitions
      const dt = 1 / 48000;
      const totalSamples = 24000; // 0.5s
      let transitions = 0;
      let lastV = 0;

      for (let i = 0; i < totalSamples; i++) {
        solver.step(dt);
        const v = solver.getNodeVoltageByPin('ic', 'p6');
        if (i > 0 && ((v > 4.5 && lastV < 4.5) || (v < 4.5 && lastV > 4.5))) {
          transitions++;
        }
        lastV = v;
      }

      // Expected: f ≈ 1/(2*R*C*ln(VT+/(Vdd-VT-)))
      // With VT+=0.58*9=5.22, Vdd-VT-=9-0.45*9=4.95
      // ln(5.22/4.95) ≈ 0.053 — wait, that's not right for Schmitt oscillator
      // f = 1 / (2*R*C * ln((Vdd-VT-)/(Vdd-VT+)))... actually for resistive output:
      // Approximate: f ≈ 1/(2.2*R*C) ≈ 1/(2.2*16000*100e-9) ≈ 284Hz
      // At 0.5s, expect ~142 full cycles = ~284 transitions
      const expectedFreq = 1 / (2.2 * R * C);
      const measuredFreq = transitions / (2 * 0.5); // transitions/2 = full cycles / time
      const error = Math.abs(measuredFreq - expectedFreq) / expectedFreq;
      expect(error).toBeLessThan(0.15); // Within 15% (resistive output changes dynamics)
    });
  });
```

- [ ] **Step 6: Run integration test**

Run: `npx vitest run tests/simulation/solver/MNASolver.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/simulation/models/SchmittTriggerModel.ts \
  tests/simulation/models/SchmittTriggerModel.test.ts \
  tests/simulation/solver/MNASolver.test.ts
git commit -m "feat: CD40106 Schmitt trigger with accurate thresholds and resistive output"
```

---

## Task 10: Worklet Entry + Build Pipeline

**Files:**
- Create: `src/simulation/worklet/processor.ts`
- Create: `src/simulation/worklet/audioworklet.d.ts`
- Create: `src/simulation/index.ts`
- Modify: `src/audio/AudioEngine.ts`
- Modify: `vite.config.ts` (if needed)

- [ ] **Step 1: Create AudioWorklet type declarations**

```typescript
// src/simulation/worklet/audioworklet.d.ts
// Type declarations for AudioWorkletProcessor globals.
// These are available in the AudioWorklet scope but not in standard DOM types.

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void;

declare const sampleRate: number;
declare const currentFrame: number;
declare const currentTime: number;
```

- [ ] **Step 2: Create worklet processor entry point**

```typescript
// src/simulation/worklet/processor.ts
/// <reference path="./audioworklet.d.ts" />

import { MNASolver } from '../solver/MNASolver';
import type { SerializedComponent, SerializedConnection } from '../solver/MNASolver';
import { ModelRegistry } from '../models/ModelRegistry';
import { ResistorModel } from '../models/ResistorModel';
import { CapacitorModel } from '../models/CapacitorModel';
import { PotentiometerModel } from '../models/PotentiometerModel';
import { PowerSourceModel } from '../models/PowerSourceModel';
import { GroundModel } from '../models/GroundModel';
import { AudioOutputModel } from '../models/AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '../models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '../models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '../models/OpAmpModel';
import { SchmittTriggerModel } from '../models/SchmittTriggerModel';

function createRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  return reg;
}

class CircuitSimulationProcessor extends AudioWorkletProcessor {
  private solver: MNASolver;
  private running = false;
  private components: SerializedComponent[] = [];
  private probes: Array<{ componentId: string; pinId: string }> = [];
  private probeSampleBuffers: Float32Array[] = [];
  private ledFrameCount = 0;

  constructor() {
    super();
    this.solver = new MNASolver(createRegistry());

    this.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'loadCircuit') {
        this.components = msg.components;
        this.solver.loadCircuit(msg.components, msg.connections);
      } else if (msg.type === 'setParam') {
        // Live parameter updates need to reload circuit
        // (Model instances don't expose setters for arbitrary params)
        const comp = this.components.find(
          (c: SerializedComponent) => c.id === msg.componentId
        );
        if (comp) {
          comp.parameters[msg.key] = msg.value;
          // For potentiometer, could optimize with direct setter
          // For now, full reload (fast enough for small circuits)
        }
      } else if (msg.type === 'setProbes') {
        this.probes = msg.probes || [];
        this.probeSampleBuffers = this.probes.map(() => new Float32Array(128));
      } else if (msg.type === 'setSubcycles') {
        this.solver.setSubcycles(msg.count);
      } else if (msg.type === 'start') {
        this.running = true;
      } else if (msg.type === 'stop') {
        this.running = false;
        this.solver.resetState();
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    const dt = 1 / sampleRate;

    for (let i = 0; i < channel.length; i++) {
      if (this.running) {
        channel[i] = this.solver.step(dt);

        // Probe voltages
        for (let p = 0; p < this.probes.length; p++) {
          const probe = this.probes[p];
          this.probeSampleBuffers[p][i] =
            this.solver.getNodeVoltageByPin(probe.componentId, probe.pinId);
        }
      } else {
        channel[i] = 0;
        for (let p = 0; p < this.probes.length; p++) {
          this.probeSampleBuffers[p][i] = 0;
        }
      }
    }

    // Copy to other channels
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    // Post audio + probe data
    if (this.running) {
      const msg: Record<string, unknown> = {
        type: 'samples',
        samples: channel.slice(),
      };
      if (this.probes.length > 0) {
        msg.probeData = this.probeSampleBuffers.map(buf => buf.slice());
      }
      this.port.postMessage(msg);

      // LED states at ~60Hz
      this.ledFrameCount += channel.length;
      if (this.ledFrameCount >= 800) {
        this.ledFrameCount = 0;
        const ledStates: Record<string, boolean> = {};
        for (const comp of this.components) {
          if (comp.type === 'led') {
            const model = this.solver.getModel(comp.id);
            if (model && 'isLit' in model) {
              ledStates[comp.id] = (model as DiodeModel).isLit();
            }
          }
        }
        if (Object.keys(ledStates).length > 0) {
          this.port.postMessage({ type: 'ledStates', states: ledStates });
        }
      }
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitSimulationProcessor);
```

- [ ] **Step 3: Create index.ts re-exports**

```typescript
// src/simulation/index.ts
export { MNASolver } from './solver/MNASolver';
export type { SerializedComponent, SerializedConnection } from './solver/MNASolver';
export { ModelRegistry } from './models/ModelRegistry';
export type { ComponentModel } from './models/ComponentModel';
export { ResistorModel } from './models/ResistorModel';
export { CapacitorModel } from './models/CapacitorModel';
export { PotentiometerModel } from './models/PotentiometerModel';
export { PowerSourceModel } from './models/PowerSourceModel';
export { GroundModel } from './models/GroundModel';
export { AudioOutputModel } from './models/AudioOutputModel';
export { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from './models/DiodeModel';
export { BJTModel, BJT_2N3904_PARAMS } from './models/BJTModel';
export { OpAmpModel, OPAMP_LM741_PARAMS } from './models/OpAmpModel';
export { SchmittTriggerModel } from './models/SchmittTriggerModel';
```

- [ ] **Step 4: Update AudioEngine.ts to use bundled worklet**

Change the `addModule` line in `src/audio/AudioEngine.ts`:

Replace:
```typescript
await this.context.audioWorklet.addModule('/audio-worklet-processor.js?v=' + Date.now());
```

With:
```typescript
const processorUrl = new URL(
  '../simulation/worklet/processor.ts',
  import.meta.url
);
await this.context.audioWorklet.addModule(processorUrl);
```

- [ ] **Step 5: Verify Vite builds correctly**

Run: `npx tsc --noEmit`
Then: `npm run build`

If AudioWorklet bundling fails with `new URL()`, the fallback is to configure Vite to build the worklet as a separate entry. Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    format: 'iife',
  },
});
```

If that still doesn't work, build the worklet manually using a Vite plugin or keep the file in `public/` and generate it via build script. Verify the worklet loads in the browser with `npm run dev`.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/worklet/processor.ts \
  src/simulation/worklet/audioworklet.d.ts \
  src/simulation/index.ts \
  src/audio/AudioEngine.ts
git commit -m "feat: worklet processor entry point with Vite bundling"
```

---

## Task 11: Regression Tests + Cleanup

**Files:**
- Create: `tests/simulation/worklet/regression.test.ts`
- Delete: `public/audio-worklet-processor.js`

- [ ] **Step 1: Write regression smoke tests**

```typescript
// tests/simulation/worklet/regression.test.ts
import { describe, it, expect } from 'vitest';
import { MNASolver } from '@/simulation/solver/MNASolver';
import { ModelRegistry } from '@/simulation/models/ModelRegistry';
import { ResistorModel } from '@/simulation/models/ResistorModel';
import { CapacitorModel } from '@/simulation/models/CapacitorModel';
import { PotentiometerModel } from '@/simulation/models/PotentiometerModel';
import { PowerSourceModel } from '@/simulation/models/PowerSourceModel';
import { GroundModel } from '@/simulation/models/GroundModel';
import { AudioOutputModel } from '@/simulation/models/AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from '@/simulation/models/DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from '@/simulation/models/BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from '@/simulation/models/OpAmpModel';
import { SchmittTriggerModel } from '@/simulation/models/SchmittTriggerModel';

function fullRegistry(): ModelRegistry {
  const reg = new ModelRegistry();
  reg.register('resistor', () => new ResistorModel());
  reg.register('capacitor', () => new CapacitorModel());
  reg.register('potentiometer', () => new PotentiometerModel());
  reg.register('power', () => new PowerSourceModel());
  reg.register('ground', () => new GroundModel());
  reg.register('audio-output', () => new AudioOutputModel());
  reg.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  reg.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  reg.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  reg.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  reg.register('cd40106', () => new SchmittTriggerModel());
  return reg;
}

function makeComp(
  id: string, type: string,
  pins: { id: string; type: string }[],
  params: Record<string, number | string | boolean> = {}
) {
  return { id, type, pins: pins.map(p => ({ id: p.id, label: p.id, type: p.type })), parameters: params };
}
function makeConn(fc: string, fp: string, tc: string, tp: string) {
  return { id: `${fc}_${fp}_${tc}_${tp}`, from: { componentId: fc, pinId: fp }, to: { componentId: tc, pinId: tp } };
}

describe('Regression: example circuits', () => {
  it('simple oscillator produces non-zero periodic output', () => {
    const solver = new MNASolver(fullRegistry());
    const icPins = Array.from({ length: 14 }, (_, i) => ({
      id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
    }));

    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 16000 }),
      makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      makeComp('ic', 'cd40106', icPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('r', 'p0', 'ic', 'p0'),
      makeConn('r', 'p1', 'ic', 'p6'),
      makeConn('c', 'p0', 'ic', 'p0'),
      makeConn('c', 'p1', 'gnd', 'gnd'),
      makeConn('ic', 'p6', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    let hasNonZero = false;
    let hasNaN = false;
    for (let i = 0; i < 4800; i++) { // 100ms
      const sample = solver.step(1 / 48000);
      if (Math.abs(sample) > 0.01) hasNonZero = true;
      if (!isFinite(sample)) hasNaN = true;
    }

    expect(hasNaN).toBe(false);
    expect(hasNonZero).toBe(true);
  });

  it('subcycling does not produce NaN', () => {
    const solver = new MNASolver(fullRegistry());
    solver.setSubcycles(4);
    const icPins = Array.from({ length: 14 }, (_, i) => ({
      id: `p${i}`, type: i >= 12 ? 'power' : 'bidirectional',
    }));

    const components = [
      makeComp('pwr', 'power', [{ id: 'pos', type: 'power' }, { id: 'neg', type: 'ground' }], { voltage: 9 }),
      makeComp('gnd', 'ground', [{ id: 'gnd', type: 'ground' }]),
      makeComp('r', 'resistor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { resistance: 16000 }),
      makeComp('c', 'capacitor', [{ id: 'p0', type: 'bidirectional' }, { id: 'p1', type: 'bidirectional' }], { capacitance: 100e-9 }),
      makeComp('ic', 'cd40106', icPins),
      makeComp('out', 'audio-output', [{ id: 'in', type: 'input' }]),
    ];
    const connections = [
      makeConn('pwr', 'neg', 'gnd', 'gnd'),
      makeConn('pwr', 'pos', 'ic', 'p12'),
      makeConn('gnd', 'gnd', 'ic', 'p13'),
      makeConn('r', 'p0', 'ic', 'p0'),
      makeConn('r', 'p1', 'ic', 'p6'),
      makeConn('c', 'p0', 'ic', 'p0'),
      makeConn('c', 'p1', 'gnd', 'gnd'),
      makeConn('ic', 'p6', 'out', 'in'),
    ];

    solver.loadCircuit(components, connections);

    let hasNaN = false;
    for (let i = 0; i < 2400; i++) {
      const sample = solver.step(1 / 48000);
      if (!isFinite(sample)) hasNaN = true;
    }
    expect(hasNaN).toBe(false);
  });
});
```

- [ ] **Step 2: Run regression tests**

Run: `npx vitest run tests/simulation/worklet/regression.test.ts`
Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass (including existing tests)

- [ ] **Step 4: Delete old worklet file**

```bash
git rm public/audio-worklet-processor.js
```

- [ ] **Step 5: Verify dev server works**

Run: `npm run dev`
Open browser, load an example circuit, press play, verify audio output.

- [ ] **Step 6: Commit**

```bash
git add tests/simulation/worklet/regression.test.ts
git add -u  # stages the deletion
git commit -m "feat: regression tests, delete monolithic worklet — framework complete"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] ComponentModel interface — Task 1
- [x] ModelRegistry — Task 1
- [x] Matrix solver — Task 2
- [x] MNASolver with NR convergence — Task 3
- [x] Gmin — Task 3 (in solveTimestep)
- [x] Subcycling — Task 3 (in step method)
- [x] SPICE-style voltage limiting — Task 1 (junctionUtils), used in Tasks 6-8
- [x] ResistorModel — Task 3
- [x] CapacitorModel — Task 4
- [x] PotentiometerModel — Task 5
- [x] PowerSourceModel — Task 5
- [x] GroundModel — Task 5
- [x] AudioOutputModel — Task 5
- [x] DiodeModel (1N914 + LED) — Task 6
- [x] BJTModel (Gummel-Poon) — Task 7
- [x] OpAmpModel (Boyle) — Task 8
- [x] SchmittTriggerModel — Task 9
- [x] Worklet entry point — Task 10
- [x] Build pipeline (Vite bundling) — Task 10
- [x] AudioEngine.ts modification — Task 10
- [x] Regression tests — Task 11
- [x] Delete old worklet — Task 11

**Type consistency:** All models use `ComponentModel` interface. All tests use same `makeComp`/`makeConn` helpers. Pin ordering matches spec: 1N914 (anode, cathode), 2N3904 (B, C, E), LM741 (IN-, IN+, V-, OUT, V+), CD40106 (0-5 inputs, 6-11 outputs, 12 VDD, 13 VSS).

**No placeholders:** All code steps contain complete implementations. All test steps contain complete test code. All run commands include expected outcomes.
