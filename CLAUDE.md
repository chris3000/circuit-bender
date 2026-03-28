# Circuit Bender

Browser-based circuit simulation for creative audio / circuit bending. Built with React + TypeScript + Vite.

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npx tsc --noEmit     # Type check (ignore SimulationEngine TS6133 warning — pre-existing)
npm test             # Run tests
```

## Architecture

### Simulation (MNA Solver)

The simulation engine is a **Modified Nodal Analysis solver** running inside an `AudioWorkletProcessor` at native audio sample rate (~48kHz). This is self-contained plain JS in `public/audio-worklet-processor.js` — worklets can't import ES modules.

**How it works:** Each timestep, components stamp conductance values into a matrix. Gaussian elimination solves all node voltages simultaneously. No sequential iteration or special-case hacks.

**Key principle:** All components must simulate through the same MNA path. No component-specific voltage propagation.

### Communication

Main thread serializes circuit topology and posts it to the worklet. The worklet posts back audio samples, probe data, and LED states.

### UI

Candy Lab + Mono Pop design system: monospace font, monochrome palette, #FF2D55 hot pink accent. 100px sidebar icon rail. Unified interaction (drag body = move, mousedown pin = wire).

## Key Files

- `public/audio-worklet-processor.js` — MNA solver (the simulation engine)
- `src/audio/AudioEngine.ts` — AudioContext + worklet communication
- `src/App.tsx` — Root component, audio/LED/probe wiring
- `src/views/SchematicView.tsx` — SVG schematic editor
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
