# Circuit Bender

Browser-based circuit simulation for creative audio / circuit bending. Built with React + TypeScript + Vite.

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npx tsc --noEmit     # Type check (ignore SimulationEngine TS6133 warning — pre-existing)
npm test             # Run tests (tests/simulation/worklet/examples.test.ts runs the real example circuits)
```

## Architecture

### Simulation (MNA Solver)

The simulation engine is a **Modified Nodal Analysis solver** running inside an `AudioWorkletProcessor`. It lives in `src/simulation/` as TypeScript: Vite serves it as modules in dev and bundles it to a self-contained `audio-worklet-processor.js` for production (plugin in `vite.config.ts`).

**How it works:** each component is a model class (`src/simulation/models/`) that stamps itself into one shared matrix; the solver (`solver/MNASolver.ts`) solves all node voltages simultaneously. No sequential iteration or special-case hacks.

**Key principle:** All components must simulate through the same MNA path. No component-specific voltage propagation.

**Model interface** (`models/ComponentModel.ts`) — stamps are split by how often they change:
- `stampMatrix` — anything that doesn't depend on the solution (conductances, companion models). The solver inverts the matrix once per discrete circuit state and caches it, so don't read `x` here.
- `stampRhs` — per-step right-hand side (source values, capacitor history).
- `stampNonlinear` + `getNonlinearNodes` — x-dependent stamps (diodes, BJTs). Newton iteration is confined to the declared nodes. Stamp the full Jacobian, limit junction voltages against the previous *iteration*, and have `convergenceError` return 0 once the linearization predicts the device currents at the new solution (see `junctionUtils.ts`).
- `findEvent` / `applyEvent` / `getDiscreteState` — discrete switching (Schmitt gate flips, clamps). Never switch state inside a stamp or `postStep`: report where in the step it happens and the solver moves to that instant. This is what gives edges sub-sample timing.

**Timing and output:** the solver takes 2 steps per audio sample (`setOversampling`), cuts a step short at each event, and restarts with a short backward-Euler step afterwards (trapezoidal otherwise). `solver/OutputSampler.ts` turns the resulting piecewise-linear signal into band-limited audio at a fixed 4× resolution, independent of the step count. Budget (Chrome worklet): a single oscillator costs ~3% of one core, the WSG ~17%.

**Starting state:** a circuit starts at its DC operating point (`initializeState`: a backward-Euler solve with an infinite step, so capacitors are open circuits), not from 0 V. Tests that want a charging curve must step a source with `updateParam`.

**Conventions the solver relies on:**
- Every `ground` symbol is the same node, wired together or not.
- The audio jack is a 1 MΩ load to ground; its `gain` parameter is an input trim that only scales the recorded level. A rail-to-rail swing is ±0.5 at gain 1.
- Models that set `ignoresUnconnectedPins` (the CD40106) get no node for unwired pins.
- The op-amp (`OpAmpModel.ts`) is a piecewise-linear macromodel: gain-bandwidth, slew rate and output swing are parameters, all handled with events rather than Newton iteration.

### Communication

Main thread serializes circuit topology and posts it to the worklet. The worklet posts back audio samples, probe data, and LED states.

`AudioEngine.updateCircuit` decides what an edit needs: a changed circuit is reloaded (which restarts the simulation), a live control (`LIVE_PARAMETERS`: pot position, switch state, jack trim) is sent as `setParam`, and moving parts on the canvas sends nothing. Add new live controls to that table and give the model an `updateParam`.

### UI

Candy Lab + Mono Pop design system: monospace font, monochrome palette, #FF2D55 hot pink accent. 100px sidebar icon rail. Unified interaction (drag body = move, mousedown pin = wire).

## Key Files

- `src/simulation/solver/MNASolver.ts` — MNA solver (the simulation engine)
- `src/simulation/solver/OutputSampler.ts` — anti-aliased conversion of solver output to audio samples
- `src/simulation/models/` — one model class per component type
- `src/simulation/worklet/processor.ts` — AudioWorkletProcessor entry point
- `src/audio/AudioEngine.ts` — AudioContext + worklet communication
- `src/App.tsx` — Root component, audio/LED/probe wiring
- `src/views/CircuitCanvas/CircuitCanvas.tsx` — React Flow circuit editor (schematic + board)
- `src/components/definitions/` — Component type definitions
- `src/examples/circuits.ts` — Example circuit builders

## Component Pin Reference

| Component | Pin 0 | Pin 1 | Pin 2 | ... |
|-----------|-------|-------|-------|-----|
| power | + (Vdd) | − (GND) | | |
| ground | GND | | | |
| resistor | 1 | 2 | | |
| capacitor | 1 | 2 | | |
| potentiometer | 1 | wiper | 3 | |
| cd40106 | 1A–6A (0-5) | 1Y–6Y (6-11) | VDD (12) | VSS (13) |
| audio-output | IN | | | |
| led | A (anode) | K (cathode) | | |

## Testing Circuits

Load examples from the header menu. The simulation needs play (▶) to be active. Right-click wires to add oscilloscope probes.

## Conventions

- Colors: #222 (dark), #F5F5F5/#EBEBEB (light), #FF2D55 (accent)
- Font: `'Courier New', Courier, monospace` everywhere
- Border radius: 8-12px on interactive elements
- Component simulate() functions use generic `pin_N` keys (mapped to actual pin IDs by the engine)
