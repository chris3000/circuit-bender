# SPICE-Grade Component Model Framework

## Problem

The circuit simulation engine has accuracy gaps across all nonlinear components and lacks an extensible architecture for adding new component models. Specific issues:

1. **LM741 op-amp is non-functional** — only stamps 10MO input impedance, output is dead. Three prior approaches failed (VCVS delay instability, VCCS gain collapse, ideal constraint singularity at saturation).
2. **1N914 diode is inaccurate** — assumes emission coefficient n=1 (real: 1.752), missing series resistance Rs=0.568O, uses crude hard voltage clamp instead of SPICE-style NR limiting.
3. **2N3904 transistor is simplified** — basic Ebers-Moll with BF=100 (real: 416.4), no Early effect (no output conductance in active region), no parasitic resistances.
4. **CD40106 thresholds are wrong** — uses 0.33/0.66 x Vdd (real: 0.45/0.58), zero output impedance (real: ~280O).
5. **LED is not a diode** — just a threshold detector, doesn't affect circuit behavior.
6. **Newton-Raphson runs 1 iteration** — nonlinear components never converge.
7. **Monolithic architecture** — all component physics hardcoded in a single if/else chain in `public/audio-worklet-processor.js`. Cannot scale to new components without modifying the solver.

## Approach

Replace the monolithic worklet with a **pluggable component model framework** where each model is a self-contained TypeScript class that stamps itself into the MNA matrix. The solver is model-agnostic. This is the same architecture SPICE has used since the 1970s.

Models are written as TypeScript ES modules in `src/simulation/models/`, testable in Node/Vitest. Vite bundles them into the worklet JS file at build time.

All existing components are upgraded to SPICE-grade accuracy. The LM741 uses a simplified Boyle macromodel — the standard approach for op-amp simulation that naturally handles gain, bandwidth, slew rate, and saturation without mode-switching hacks.

## All Changes

### New Files

```
src/simulation/
  models/
    ComponentModel.ts          # Interface definition
    ModelRegistry.ts           # Factory registry
    ResistorModel.ts           # Passive: conductance stamp
    CapacitorModel.ts          # Passive: trapezoidal companion
    PotentiometerModel.ts      # Passive: split resistance
    DiodeModel.ts              # Nonlinear: Shockley with NR limiting (1N914 + LED)
    BJTModel.ts                # Nonlinear: Gummel-Poon (2N3904)
    OpAmpModel.ts              # Subcircuit: simplified Boyle macromodel (LM741)
    SchmittTriggerModel.ts     # IC: CD40106 (6 gates, resistive CMOS output)
    AudioOutputModel.ts        # Sink: voltage reader
    PowerSourceModel.ts        # Source: voltage source stamp
    GroundModel.ts             # Reference: ground node marker
  solver/
    MNASolver.ts               # Model-agnostic MNA + NR solver
    matrix.ts                  # Gaussian elimination with partial pivoting
  worklet/
    processor.ts               # AudioWorkletProcessor entry point
  index.ts                     # Public API re-exports

tests/simulation/
  models/
    ResistorModel.test.ts
    CapacitorModel.test.ts
    DiodeModel.test.ts
    BJTModel.test.ts
    OpAmpModel.test.ts
    SchmittTriggerModel.test.ts
    LEDModel.test.ts
  solver/
    MNASolver.test.ts          # Integration tests (reference circuits)
    matrix.test.ts             # Gaussian elimination edge cases
  worklet/
    regression.test.ts         # Example circuit smoke tests
```

### Modified Files

- `src/audio/AudioEngine.ts` — Change `addModule()` URL to use Vite-bundled worklet entry
- `vite.config.ts` — Vite's `new URL(..., import.meta.url)` pattern should bundle the worklet automatically. If AudioWorklet module loading requires classic script (non-ESM) format, add a Vite plugin or rollup config to output the worklet entry as IIFE. Verify during implementation.

### Deleted Files

- `public/audio-worklet-processor.js` — Replaced entirely by the bundled worklet

## 1. Component Model Framework

### Interface

Every component model implements this interface:

```typescript
interface ComponentModel {
  readonly type: string;
  getInternalNodeCount(): number;
  getBranchCount(): number;
  init(pinNodes: number[], internalNodeStart: number, branchStart: number,
       params: Record<string, number>): void;
  stamp(G: Float64Array[], b: Float64Array, x: Float64Array, dt: number): void;
  postStep(x: Float64Array, dt: number): void;
  convergenceError(xOld: Float64Array, xNew: Float64Array): number;
  reset(): void;
}
```

- `getInternalNodeCount()` — Number of internal MNA nodes (e.g., op-amp gain node, diode series resistance node, BJT intrinsic terminals).
- `getBranchCount()` — Number of MNA branch variables (e.g., voltage source currents).
- `init()` — Receives the mapping from external pins to MNA node indices, plus starting indices for internal nodes and branches. Called once when circuit is loaded.
- `stamp()` — Stamps conductances and currents into the MNA matrix each NR iteration. Reads the current solution guess from `x` to linearize nonlinear elements.
- `postStep()` — Updates internal state (capacitor voltages, Schmitt trigger outputs) after NR converges. Called once per timestep (not per NR iteration).
- `convergenceError()` — Returns the maximum voltage change across this model's nonlinear junctions. Linear models return 0.
- `reset()` — Clears all internal state for simulation restart.

### Registry

```typescript
class ModelRegistry {
  private factories: Map<string, () => ComponentModel> = new Map();
  register(type: string, factory: () => ComponentModel): void;
  create(type: string): ComponentModel | null;
  has(type: string): boolean;
}
```

The solver creates model instances via the registry. It never imports or references specific model classes.

### Solver

The MNA solver (`MNASolver.ts`) is model-agnostic:

```
loadCircuit(components, connections):
  1. Build nets (union-find)
  2. Build node map (assign MNA indices, identify ground)
  3. For each component:
     - model = registry.create(component.type)
     - Allocate internal nodes (model.getInternalNodeCount())
     - Allocate branches (model.getBranchCount())
     - model.init(pinNodes, internalNodeStart, branchStart, params)
  4. matrixSize = numNodes + totalInternalNodes + totalBranches

step(dt):
  subcycles = this.subcycleCount  // configurable: 1, 2, 4, or 8
  subDt = dt / subcycles
  for s = 0..subcycles:
    NR loop (max 8 iterations, tolerance 1e-4V):
      Clear G, b
      For each model: model.stamp(G, b, x, subDt)
      Add Gmin (1e-12) to all diagonal entries
      xNew = solve(G, b)
      maxError = max of all model.convergenceError(x, xNew)
      x = xNew
      if converged: break
    For each model: model.postStep(x, subDt)
  return output voltage
```

## 2. Solver Upgrades

### Newton-Raphson Convergence

- **MAX_NR_ITERATIONS = 8** (up from 1)
- **NR_VTOL = 1e-4 V** (100uV voltage tolerance)
- Convergence checked via `convergenceError()` on each model
- First iteration always runs (skip convergence check on iter 0)

### SPICE-Style Junction Voltage Limiting

Applied inside each nonlinear model's `stamp()` before evaluating the Shockley exponential:

```
limitJunctionVoltage(vNew, vOld, nVt, Vcrit):
  if vNew > Vcrit and |vNew - vOld| > 2 * nVt:
    if vOld > 0:
      vNew = vOld + 2 * nVt * sign(vNew - vOld)
    else:
      vNew = Vcrit
  return vNew
```

Where `Vcrit = n * Vt * ln(n * Vt / (sqrt(2) * Is))`.

This prevents the exponential from causing NR overshoot and divergence. It is the single most important improvement for NR stability with diodes and BJTs.

### Gmin — Minimum Conductance

Gmin = 1e-12 S (1 TO) added to every node's diagonal entry after all models stamp. Prevents floating nodes from causing matrix singularity. Negligible compared to any real circuit impedance.

### Subcycling

Configurable oversampling inside the worklet. The AudioWorklet still produces one sample per audio sample period, but the solver runs N steps internally at dt/N.

- Exposed via worklet message: `{ type: 'setSubcycles', count: N }`
- Valid values: 1 (default), 2, 4, 8
- Improves temporal accuracy for oscillator frequency precision and fast transients
- Capacitor companion models receive `subDt`, and `postStep()` updates state each subcycle

### Matrix Solver

Gaussian elimination with partial pivoting (same algorithm as current). Pre-allocate the augmented matrix once in `loadCircuit()` and reuse each timestep to reduce GC pressure in the audio thread.

## 3. Component Models

### Resistor

Conductance stamp 1/R between pin 0 and pin 1. No internal nodes, no branches.

### Capacitor

Trapezoidal companion model. Geq = 2C/dt, Ieq = Geq * vPrev + iPrev. `postStep()` updates vPrev, iPrev. No internal nodes, no branches.

### Potentiometer

Two conductances: R_upper = maxR * pos, R_lower = maxR * (1-pos). Position clamped to [0.001, 0.999]. No internal nodes, no branches.

### Power Source

Standard MNA voltage source stamp. 1 branch variable (source current). Stamps into extra row/column per standard MNA formulation.

### Ground

Topology marker. The solver recognizes ground components during node mapping and designates their net as the reference node (excluded from matrix). Stamps nothing.

### Audio Output

Stamps Gmin from input pin to ground (prevents floating). DC blocker and audio normalization live in the worklet processor, not in the model.

### 1N914 Diode — Full SPICE Level 1

**Parameters:**

| Param | Value | Meaning |
|-------|-------|---------|
| Is | 2.52e-9 A | Saturation current |
| n | 1.752 | Emission coefficient |
| Rs | 0.568 O | Series bulk resistance |
| Vt | 25.85 mV | Thermal voltage (25C) |

**Internal nodes: 1** (node A' between Rs and junction).

**Stamps:**
- Rs: conductance 1/0.568 between anode pin and internal node A'
- Junction: Shockley linearization between A' and cathode pin

**NR linearization at operating point Vd0:**
```
Vcrit = n * Vt * ln(n * Vt / (sqrt(2) * Is))
Vd = limitJunctionVoltage(Vd_guess, Vd_prev, n*Vt, Vcrit)
expVd = exp(Vd / (n * Vt))
Id = Is * (expVd - 1)
Gd = (Is / (n * Vt)) * expVd
Ieq = Id - Gd * Vd
Stamp Gd between A' and K. Stamp Ieq into b vector.
```

**convergenceError:** |Vd_new - Vd_old|

### LED — Diode with LED Parameters

Same DiodeModel class, different parameters:

| Param | Value | Meaning |
|-------|-------|---------|
| Is | 1e-20 A | Very low saturation current |
| n | 2.0 | Higher emission coefficient |
| Rs | 0 O | Negligible |
| Vf | ~1.8V | Falls out of Is and n |

**Internal nodes: 0** (Rs = 0, no internal node needed).

**DiodeModel Rs=0 handling:** `getInternalNodeCount()` returns 1 when Rs > 0 (stamps Rs between anode and internal node A'), returns 0 when Rs = 0 (stamps junction directly between anode and cathode pins). The model checks Rs in `init()` and branches accordingly.

LED brightness derived from forward current computed during `stamp()`. Model exposes a method for LED state reporting.

### 2N3904 BJT — Gummel-Poon

**Parameters (SPICE model):**

| Param | Value | Meaning |
|-------|-------|---------|
| IS | 6.734e-15 A | Transport saturation current |
| BF | 416.4 | Forward current gain |
| NF | 1.0 | Forward emission coefficient |
| VAF | 74.03 V | Forward Early voltage |
| IKF | 66.78 mA | High-current beta roll-off |
| BR | 0.7389 | Reverse current gain |
| NR | 1.0 | Reverse emission coefficient |
| VAR | 28 V | Reverse Early voltage |
| RB | 10 O | Base resistance |
| RC | 1 O | Collector resistance |
| RE | 0.1 O | Emitter resistance |

**Internal nodes: 3** (B', C', E' — intrinsic terminals behind parasitic resistances).

**Stamps:**
1. RB: conductance 1/10 between external B and internal B'
2. RC: conductance 1/1 between external C and internal C'
3. RE: conductance 1/0.1 between external E and internal E'
4. Gummel-Poon nonlinear stamps between B', C', E'

**Gummel-Poon equations (per NR iteration):**
```
If = IS * (exp(Vbe'/(NF*Vt)) - 1)         // forward junction current
Ir = IS * (exp(Vbc'/(NR*Vt)) - 1)         // reverse junction current

q1 = 1 / (1 - Vbc'/VAF - Vbe'/VAR)        // Early effect
q2 = If/IKF                                // high-injection (IKR -> infinity)
qb = (q1/2) * (1 + sqrt(1 + 4*q2))        // normalized base charge

It = (If - Ir) / qb                        // transport current
Ic = It - Ir/BR                            // collector current
Ib = If/BF + Ir/BR                         // base current
```

**NR linearization:** Compute partial derivatives dIc/dVbe, dIc/dVbc, dIb/dVbe, dIb/dVbc. Stamp as a two-port VCCS between B', C', E' nodes with companion currents.

Junction voltage limiting applied to both Vbe and Vbc.

**convergenceError:** max(|dVbe|, |dVbc|)

### LM741 Op-Amp — Simplified Boyle Macromodel

**Parameters (LM741 datasheet):**

| Param | Value | Derivation |
|-------|-------|------------|
| Aol | 200,000 | Open-loop DC gain |
| GBW | 1.5 MHz | Gain-bandwidth product |
| fp | 7.5 Hz | = GBW / Aol |
| Rin | 2 MO | Differential input resistance |
| Rout | 75 O | Output resistance |
| SR | 0.5 V/us | Slew rate |
| Cc | 30 pF | Compensation capacitor |
| Rg | 707 MO | = 1/(2pi * fp * Cc) |
| gm | 283 uA/V | = Aol / Rg |
| Imax | 15 uA | = SR * Cc |
| Vclip | 53 mV | = Imax / gm |

**External pins:** IN- (pin 1), IN+ (pin 2), V- (pin 3), OUT (pin 5), V+ (pin 6)

**Internal nodes: 1** (gain node g). **Branches: 0.**

**Six stamp elements:**

1. **Input resistance:** Conductance 1/Rin = 5e-7 S between IN+ and IN-

2. **Input VCCS with slew limiting** (drives gain node):
   - Vdiff = V(IN+) - V(IN-)
   - Linear (|Vdiff| < Vclip): stamp gm as VCCS — G[g][IN+] += gm, G[g][IN-] -= gm
   - Positive saturation (Vdiff >= Vclip): stamp gm=0, b[g] += Imax
   - Negative saturation (Vdiff <= -Vclip): stamp gm=0, b[g] -= Imax

3. **Gain node load:** Conductance 1/Rg = 1.41e-9 S from gain node to ground

4. **Compensation capacitor:** Trapezoidal companion at gain node. Geq = 2*Cc/dt. postStep() updates vPrev, iPrev.

5. **Output buffer (Norton equivalent):**
   - G[OUT][OUT] += 1/Rout (13.3 mS)
   - G[OUT][g] += 1/Rout (VCCS: output follows gain node)
   - Unilateral: no G[g][OUT] (buffer does not load gain stage)

6. **Rail clamp diodes:** Two Shockley diodes (Is=1e-12, n=1):
   - D1: anode=OUT, cathode=V+ (conducts when Vout > V+ - Vf)
   - D2: anode=V-, cathode=OUT (conducts when Vout < V- + Vf)

**Why this works (vs prior failures):**
- No timestep delay: VCCS stamps into the same matrix as the feedback network. Solved simultaneously.
- No gain collapse: Gain distributed across stages (gm * Rg = 200,000). No single extreme matrix entry.
- Natural saturation: Clamp diodes engage within NR loop. No mode switching.
- Bandwidth: Comp cap creates dominant pole at 7.5 Hz. GBW = 1.5 MHz falls out of physics.
- Slew rate: VCCS saturates at Imax = 15uA. SR = Imax/Cc = 0.5 V/us.

**convergenceError:** |dV_gain|

### CD40106 Schmitt Trigger — Resistive CMOS Output

**Parameters:**

| Param | Value | Meaning |
|-------|-------|---------|
| VT+ | 0.58 * Vdd | Positive-going threshold |
| VT- | 0.45 * Vdd | Negative-going threshold |
| Rout | 280 O | Output on-resistance |
| Roff | 1 GO | Output off-resistance |

**Internal nodes: 0. Branches: 0.**

Each gate modeled as CMOS push-pull with switchable conductances:
- **Output HIGH:** conductance 1/280 between output and Vdd, conductance 1/1G between output and Vss
- **Output LOW:** conductance 1/1G between output and Vdd, conductance 1/280 between output and Vss

Threshold update in `postStep()`: read input voltage, compare against VT+ / VT- with hysteresis, flip output state.

This eliminates all voltage source branch variables for Schmitt gates (up to 6 per IC removed from matrix).

## 4. Build Pipeline

### Vite Bundling

The worklet entry point (`src/simulation/worklet/processor.ts`) imports all models and the solver. Vite bundles it using the `new URL()` pattern:

```typescript
// In AudioEngine.ts
const processorUrl = new URL(
  '../simulation/worklet/processor.ts',
  import.meta.url
);
await this.context.audioWorklet.addModule(processorUrl);
```

Vite treats this as a separate entry point, resolves all TypeScript imports, and produces a self-contained IIFE JS file. During dev, transforms are applied on-the-fly.

### Worklet Entry

The processor.ts file:
1. Imports and registers all models in a ModelRegistry
2. Creates an MNASolver with the registry
3. Defines the AudioWorkletProcessor class
4. Delegates message handling (loadCircuit, setParam, setProbes, start, stop, setSubcycles)
5. Delegates audio processing to solver.step()
6. Posts back samples, probeData, and ledStates (same protocol as current)

### AudioEngine Changes

Only the `addModule()` URL changes. The message protocol is identical. Main thread code is unaffected.

## 5. Testing

### Tier 1: Model Unit Tests

Each model tested in isolation — verify stamp() produces correct matrix entries at known operating points.

- Resistor: conductance values
- Capacitor: Geq and Ieq at given dt and previous state
- Diode: Gd and Ieq match Shockley with n=1.752 at specific Vd. Voltage limiting clamps correctly.
- BJT: Gummel-Poon Ic matches expected value in active region. Early effect produces non-zero dIc/dVce.
- Op-amp: gm stamp in linear region. Slew limiting at Vdiff > Vclip. Comp cap companion values.
- CD40106: threshold flip at correct voltages. Output conductance to correct rail.

### Tier 2: Solver Integration Tests

Reference circuits with analytically known solutions:

- Resistor divider: 9V, 10k/10k. Expect 4.5V.
- RC step response: track analytic V*(1-e^(-t/RC)) within 1%.
- Diode forward: 9V, 1k, 1N914, GND. Expect ~0.65V across diode.
- BJT CE amplifier: verify Ic, Vce, and Early effect output conductance.
- Op-amp inverting: R1=10k, R2=100k. Verify gain = -10. Verify rail saturation.
- Op-amp integrator: verify linear ramp and slew rate limiting.
- Schmitt oscillator: R+C+gate. Verify oscillation frequency within 5% (1x subcycling) and 1% (4x subcycling).

### Tier 3: Regression / Smoke Tests

Load each example circuit (Simple Oscillator, WSG, LED Blinker), run timesteps, verify non-NaN non-silent output.

## Summary of Accuracy Improvements

| Component | Before | After |
|-----------|--------|-------|
| 1N914 | n=1, no Rs, hard clamp | n=1.752, Rs=0.568O, SPICE voltage limiting |
| 2N3904 | Ebers-Moll, BF=100, no Early | Gummel-Poon, BF=416.4, VAF=74V, Rb/Rc/Re |
| LM741 | Dead (input impedance only) | Boyle macromodel: gain, bandwidth, slew, saturation |
| CD40106 | 33%/66% thresholds, 0O output | 45%/58% thresholds, 280O output |
| LED | Threshold detector | Real diode model (Is=1e-20, n=2) |
| NR solver | 1 iteration, no limiting | 8 iterations, SPICE voltage limiting, Gmin |
| Architecture | Monolithic if/else | Pluggable model framework |
| Subcycling | None (48kHz fixed) | Configurable 1-8x (up to 384kHz) |
