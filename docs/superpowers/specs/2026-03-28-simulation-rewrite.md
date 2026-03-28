# Simulation Engine Rewrite

**Date:** 2026-03-28
**Goal:** Replace the broken DC-analysis simulation with a time-stepped, audio-rate simulation that runs inside an AudioWorkletProcessor. Oscillation frequency emerges from component values (R, C), not hardcoded counters.

## Problems Solved

1. No time domain — capacitors can't charge/discharge, frequency is hardcoded
2. Net voltage overwrite race condition — sequential iteration causes drift/distortion
3. Sample rate coupled to display refresh (rAF) — pitch varies with monitor Hz
4. Ring buffer overflow at >60fps — audio glitches
5. Shared mutable state between tick iterations — progressive distortion

## Architecture

### Data Flow

```
Main thread                              Audio thread (worklet)
───────────                              ───────────────────────
CircuitContext                           AudioWorkletProcessor
  │                                        │
  ├─ on circuit change ──[postMessage]──►  ├─ rebuilds SimulationEngine
  │   { type: 'loadCircuit',               │   with new topology
  │     components, connections }           │
  │                                        │
  ├─ on param change ───[postMessage]──►   ├─ updates component param
  │   { type: 'setParam',                  │
  │     componentId, key, value }          │
  │                                        │
  ├─ start/stop ────────[postMessage]──►   ├─ enables/disables sim
  │                                        │
  │                                        ├─ process() called by browser
  │                                        │   at exact sample rate
  │                                        │   128 samples per call
  │                                        │   dt = 1/sampleRate
  │                                        │
  │   ◄──[postMessage]─── samples ─────────┤  posts 128-sample block
  │                                        │  back for oscilloscope
  └─ OscilloscopePanel reads samples
```

No shared mutable state between threads. The worklet owns all simulation state.

### What Gets Removed

- `src/audio/AudioBridge.ts` — worklet IS the bridge now
- `SimulationEngine.tick()` / rAF loop — simulation runs in worklet's `process()`
- Ring buffer in `audio-worklet-processor.js` — worklet writes directly to output
- All `sampleCallback` plumbing in App.tsx

### What Gets Modified

- `src/audio/AudioEngine.ts` — posts circuit data to worklet instead of sample buffers
- `src/simulation/SimulationEngine.ts` — becomes a pure stateful solver (no rAF, no audio). Instantiated inside the worklet.
- `public/audio-worklet-processor.js` — imports SimulationEngine, runs per-sample simulation
- `src/App.tsx` — simplified audio flow: AudioEngine manages context + worklet, posts circuit changes
- `src/components/definitions/CD40106.tsx` — remove hardcoded phase counter, use pure Schmitt trigger logic
- `src/components/definitions/Capacitor.tsx` — add real charge/discharge model

### What Stays

- `src/simulation/NetAnalyzer.ts` — union-find net building (runs inside worklet)
- Component definition structure — `simulate()` functions on each definition
- `src/views/Oscilloscope/` — reads sample data posted back from worklet

## Component Simulation Models

All models receive `dt = 1/sampleRate` per timestep.

### Capacitor

Stateful. Tracks voltage across terminals.

```
I = C * (dV / dt)
// Rearranged for simulation:
V_cap += I * dt / C
```

Inputs: current flowing through it (determined by connected resistor/source).
State: `voltage` (persists across timesteps).

### Resistor

Stateless. Pure Ohm's law.

```
I = (V1 - V2) / R
```

### CD40106 Schmitt Trigger Inverter

Per-gate state. 6 independent gates, each with:
- `outputHigh: boolean` — current output state
- Thresholds: `V_high = 0.66 * Vdd`, `V_low = 0.33 * Vdd`

Logic per timestep:
```
if outputHigh and V_input > V_high:
    outputHigh = false    // output goes LOW
if !outputHigh and V_input < V_low:
    outputHigh = true     // output goes HIGH

V_output = outputHigh ? Vdd : 0
```

No internal oscillator. When wired with R + C in feedback, oscillation emerges naturally from the capacitor charging/discharging through the resistor and the output flipping at thresholds. Frequency: `f ≈ 1 / (1.2 * R * C)`.

### Potentiometer

Variable resistor. Wiper position (0-1) maps to two resistance values:
```
R_top = R_total * position
R_bottom = R_total * (1 - position)
```

### Power Supply

Fixed voltage source. Pin 0 = Vdd (default 9V), Pin 1 = 0V.

### Ground

Fixed 0V reference.

### Audio Output

Reads voltage at input pin. Normalizes to [-1, 1]:
```
sample = (V_input / Vdd) * 2 - 1
clamp(sample, -1, 1)
```

## Circuit Solver (Per Timestep)

Single-pass node voltage resolution. Not full MNA — works for circuits with clear signal flow.

### Algorithm

```
for each timestep (dt = 1/sampleRate):

  1. Set fixed node voltages:
     - Power nodes = Vdd
     - Ground nodes = 0V

  2. Resolve Schmitt trigger outputs:
     - For each gate, read input node voltage
     - Apply threshold logic, set output node voltage
     (Schmitt outputs are treated as ideal voltage sources)

  3. Compute currents through passive components:
     - Resistors: I = (V_a - V_b) / R
     - Capacitors: I = same as current through series resistor

  4. Update capacitor states:
     - V_cap += I * dt / C

  5. Update node voltages from capacitor states:
     - Nodes connected to capacitor terminals get updated voltage

  6. Read output sample:
     - Audio output node voltage → normalize → write to output buffer
```

### Limitations

- Single-pass: assumes signal flows from sources through passives to active components to outputs. No iterative convergence.
- No current limiting on voltage sources (ideal sources).
- No parasitic capacitance/inductance.
- Sufficient for: CD40106 oscillators, RC filters, voltage dividers, LED circuits — the core circuit bending repertoire.

## Worklet Communication Protocol

### Main → Worklet Messages

**loadCircuit:**
```typescript
{
  type: 'loadCircuit',
  components: Array<{
    id: string,
    type: string,
    pins: Array<{ id: string, label: string, type: string }>,
    parameters: Record<string, number | string | boolean>,
  }>,
  connections: Array<{
    id: string,
    from: { componentId: string, pinId: string },
    to: { componentId: string, pinId: string },
  }>,
}
```

**setParam:**
```typescript
{
  type: 'setParam',
  componentId: string,
  key: string,
  value: number | string | boolean,
}
```

**start / stop:**
```typescript
{ type: 'start' }
{ type: 'stop' }
```

### Worklet → Main Messages

**samples** (posted every process() call = every 128 samples):
```typescript
{
  type: 'samples',
  samples: Float32Array,  // 128 normalized [-1,1] samples
}
```

## File Structure

```
src/simulation/
  SimulationEngine.ts     — Pure solver class (no rAF, no audio)
  NetAnalyzer.ts          — Unchanged (union-find)
  models/
    ComponentModel.ts     — Base interface for component models
    ResistorModel.ts      — Ohm's law
    CapacitorModel.ts     — Stateful charge/discharge
    SchmittGateModel.ts   — CD40106 gate with threshold state
    PotModel.ts           — Variable resistor
    SourceModel.ts        — Fixed voltage (power/ground)
    OutputModel.ts        — Audio output (voltage → sample)

src/audio/
  AudioEngine.ts          — AudioContext + worklet lifecycle + circuit posting

public/
  audio-worklet-processor.js  — Self-contained simulation + audio output
    (AudioWorklets can't import ES modules in all browsers.
     The solver logic is written directly in this file as plain JS.
     Component models are registered as simple objects with step() functions.
     The main thread posts serialized circuit data; the worklet
     rebuilds its internal model from that data.)

DELETED:
  src/audio/AudioBridge.ts
```

## Out of Scope

- Full MNA matrix solver
- Newton-Raphson convergence
- Multi-pass iteration for complex feedback loops
- Transistor models (2N3904 can stay as a simple switch for now)
- LM741 op-amp simulation
- Frequency-domain analysis
