# Circuit Bender - Phase 3: Simulation, Audio & Breadboard

**Date:** 2026-03-27
**Status:** Approved
**Version:** 3.0
**Phase:** 3 of 4

## Overview

Phase 3 brings Circuit Bender to life. Users can build a circuit, hear it through their speakers, see waveforms on an oscilloscope, view a realistic breadboard representation, and tweak component values in real time. This phase adds the simulation engine, audio pipeline, breadboard view, oscilloscope panel, undo/redo, interactive controls, and four new components.

**Goals:**
- Real-time circuit simulation at 48kHz sample rate
- Audio output through PC speakers via Web Audio API
- Canvas-based breadboard view with moderately realistic rendering
- Oscilloscope panel for real-time waveform visualization
- Interactive potentiometers, editable resistors/capacitors
- Undo/redo for all circuit mutations
- Four new components: 2N3904, 1N914, Audio Output Jack, LED

**Approach:**
Hybrid simulation activation — the simulation loop idles until any output component (Audio Output Jack, LED) is connected to a net. Once activated, it runs continuously at audio sample rate, computing node voltages every timestep. Audio is delivered to the AudioWorklet via PostMessage, with the interface designed for a future SharedArrayBuffer upgrade.

**Out of Scope:**
- Cloud storage and user accounts
- Circuit sharing and collaboration
- Mobile/tablet support
- Web Worker for simulation (upgrade path if needed)
- SharedArrayBuffer audio (upgrade path designed but not implemented)

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer                                 │
│  ┌──────────────────────┐  ┌──────────────────────────┐     │
│  │ Schematic View (SVG) │  │ Breadboard View (Canvas) │     │
│  │ + Component Drawer   │  │ + Auto-placement         │     │
│  └──────────────────────┘  └──────────────────────────┘     │
│              ↕ Synchronized through Circuit Model            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Oscilloscope Panel (fixed bottom, collapsible)        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Circuit Model + Undo Stack                      │
│  Components | Connections | Simulation State                │
│  UndoManager: Circuit[] snapshot stack (max 50)             │
└─────────────────────────────────────────────────────────────┘
                    ↓                    ↓
┌──────────────────────────┐  ┌──────────────────────────────┐
│   Simulation Engine      │  │   Audio Engine               │
│   Hybrid activation:     │  │   AudioWorklet + PostMessage │
│   idle until output      │  │   Voltage → audio samples    │
│   connected, then 48kHz  │  │   Upgrade path to SAB        │
└──────────────────────────┘  └──────────────────────────────┘
```

### Key Data Flows

1. **Simulation activation:** SimulationEngine watches the circuit for output components (Audio Output Jack, LED). When one is connected to a net, the engine starts its continuous loop. When all outputs are removed, it idles.

2. **Audio path:** SimulationEngine produces per-sample voltages → AudioBridge reads voltages from Audio Output Jack nets → converts voltage range (0V to supply voltage) to audio range (-1 to +1) → PostMessage to AudioWorkletProcessor → PC speakers.

3. **Breadboard sync:** When a component is placed in schematic view, a packing algorithm assigns it the next available breadboard position. User can reposition manually in breadboard view. Both views render from the same Circuit model.

4. **Undo/redo:** Every Circuit-mutating action pushes the previous Circuit instance onto the undo stack. Ctrl+Z pops and restores. Ctrl+Shift+Z re-applies. Stack capped at 50 entries.

## Simulation Engine

### Hybrid Activation

The simulation engine subscribes to circuit changes. After each change, it scans for output components (Audio Output Jack, LED). If any output component has at least one pin connected to a net, the engine starts its continuous loop. Otherwise it stops and releases resources.

Output component types that trigger activation:
- Audio Output Jack
- LED
- Any future output components (speakers, motors, etc.)

### Net Analysis

Connections are grouped into nets — sets of electrically connected pins. If pin A connects to pin B, and pin B connects to pin C, all three share a net and therefore share a voltage. The NetAnalyzer builds nets from the circuit's connection list using a union-find algorithm.

Nets are cached and rebuilt only when connections change (components added/removed, wires created/deleted).

### Simulation Loop

When active, runs at 48kHz (1/48000th of a second per timestep):

1. **Build nets** from connections (cached, rebuilt on circuit change)
2. **Resolve power sources** — find nets connected to Power Supply or Ground, set their voltages
3. **For each component, compute outputs from inputs:**
   - Resistor: Ohm's law (V = IR)
   - Capacitor: Simplified RC charging (voltage ramp toward target)
   - CD40106: Schmitt trigger threshold comparison per gate with hysteresis
   - LM741: Differential gain with rail clamping at supply voltage
   - 2N3904: Switch model (on/off based on base-emitter voltage threshold of 0.7V)
   - 1N914: Forward bias threshold (conducts above 0.7V with 0.7V drop)
   - Potentiometer: Voltage divider based on wiper position
   - LED: Forward voltage check (~2V), updates visual state
4. **Propagate voltages** across nets
5. **Push audio samples** to AudioBridge (if Audio Output Jack present)
6. **Update output states** (LED on/off)

### Performance

- Run on main thread for MVP
- Only simulate components connected to active nets
- Use lookup tables for common calculations (RC time constants)
- Batch similar components together
- Upgrade path: move to Web Worker if performance becomes an issue

## Audio Engine

### Components

**AudioEngine** — Top-level manager. Creates the AudioContext, loads the AudioWorklet, handles start/stop/suspend lifecycle. Exposes a master volume control and mute toggle. AudioContext starts suspended per browser autoplay policy; resumes on first user interaction or explicit "Start Audio" button.

**AudioBridge** — Sits between SimulationEngine and Web Audio API. Collects voltage samples from Audio Output Jack nets each timestep, maps them to audio range, and buffers them for transfer. Collects 128 samples (matching AudioWorklet's default render quantum) before sending via PostMessage (~375 messages/second rather than 48,000).

**AudioWorkletProcessor** — Runs in the audio rendering thread. Receives sample buffers via PostMessage, writes them to the audio output. Handles buffer underrun gracefully by outputting silence rather than glitching.

### Voltage-to-Audio Mapping

The supply voltage is read from the circuit's Power Supply component (configurable, default 9V):

```
audioSample = (voltage / supplyVoltage) * 2 - 1
```

- 0V → -1.0
- supplyVoltage/2 → 0.0
- supplyVoltage → +1.0

### PostMessage to SharedArrayBuffer Upgrade Path

The AudioBridge exposes a `sendSamples(buffer: Float32Array)` interface. The MVP implementation uses PostMessage. A future implementation can swap in a SharedArrayBuffer-backed ring buffer behind the same interface, requiring no changes to SimulationEngine or AudioWorkletProcessor.

SharedArrayBuffer requires cross-origin isolation headers (COOP/COEP), which complicates deployment, so it is deferred.

## Breadboard View

### Breadboard Layout

Standard 830-point breadboard geometry:
- 2 power rails at top (+ and -), 2 at bottom
- 63 columns, 5 rows per side (a-e, f-j), separated by a center channel
- Power rails run horizontally (all holes in a rail connected)
- Main grid columns run vertically (5 holes per column connected within each side)

### Rendering (Canvas 2D)

Moderately realistic — recognizable as a breadboard but clearly digital. Not photorealistic.

**Layers (back to front):**
1. Board background — tan/beige with rounded corners, subtle shadow
2. Hole grid — metal contact holes with slight depth effect
3. Power rail markings — red/blue lines along rails
4. Center channel — gap between row e and row f
5. Components — rendered using each definition's `breadboard.renderer` (black DIP packages with notch marks, disc capacitors, colored resistors, etc.)
6. Wires — colored curves connecting component pins

### Auto-Placement Algorithm

When a component is placed on the schematic, assign a breadboard position:
1. Track occupied positions in a grid map
2. ICs straddle the center channel (standard breadboard practice)
3. Other components pack left-to-right, top-to-bottom into available rows
4. Leave 1-column gaps between components for readability
5. User can manually reposition in breadboard view after auto-placement

### Wire Rendering

Breadboard wires use quadratic Bezier curves with slight vertical droop to simulate real wire behavior.

**Wire color convention:**
- Red: wires on nets connected to a Power Supply component
- Black: wires on nets connected to a Ground component
- Blue: all other wires (signal)

If a net has both Power Supply and Ground connected (a short — which validation should warn about), default to red.

## Oscilloscope Panel

### UI Layout

- Fixed bottom panel, full width, default height ~200px
- Collapse/expand toggle button on top edge
- Left side: probe controls (add/remove probes, color per channel)
- Center: waveform display canvas showing voltage over time
- Right side: scale controls (time/div, volts/div)

### Probing

Users add probes by clicking "Add Probe" then clicking a wire/net in the schematic view. Each probe gets a color following real oscilloscope conventions:
- Channel 1: green
- Channel 2: yellow
- Channel 3: cyan
- Channel 4: magenta

Maximum 4 simultaneous probes.

### Waveform Rendering

- Canvas 2D, redrawn each animation frame
- Rolling display: new samples push in from the right, old samples scroll left
- Configurable time scale: 1ms/div to 100ms/div
- Configurable voltage scale: 0.5V/div to 5V/div
- Grid lines at each division (dotted, subtle)
- Each channel rendered as a colored line
- Rolling buffer of last ~10,000 samples per channel

### Data Flow

The SimulationEngine exposes a `probeSample(netId): number` method. The oscilloscope reads probed net voltages at each simulation timestep and stores them in a rolling buffer. The rendering loop reads from this buffer at animation frame rate.

## Undo/Redo System

### UndoManager

Leverages the existing immutable Circuit model — each mutation already returns a new Circuit instance.

- Maintains two arrays: `undoStack: Circuit[]` and `redoStack: Circuit[]`
- Max stack size: 50 entries (oldest entries dropped when exceeded)
- Every Circuit-mutating action in CircuitContext (addComponent, removeComponent, updateComponent, addConnection, removeConnection) pushes the current Circuit onto undoStack before applying the change
- Any new mutation clears the redoStack (standard undo behavior)

### Operations

- **Undo (Ctrl+Z):** Pop from undoStack, push current Circuit to redoStack, restore popped Circuit
- **Redo (Ctrl+Shift+Z / Ctrl+Y):** Pop from redoStack, push current Circuit to undoStack, restore popped Circuit

### Integration with CircuitContext

A `withUndo` wrapper captures the before-state around each mutation:

```typescript
const withUndo = (mutationFn) => {
  undoStack.push(currentCircuit)
  redoStack = []
  mutationFn()
}
```

### What's Not Tracked

- Selection state (selecting/deselecting doesn't create undo entries)
- View state (pan, zoom, tool mode)
- Oscilloscope probe state
- Simulation running state

These are UI concerns, not circuit data.

### UI

- Toolbar buttons for undo/redo with disabled state when stack is empty
- Keyboard shortcuts shown in tooltips

## New Component Definitions

### 2N3904 — NPN Transistor

- **Category:** active (semiconductor)
- **Pins:** 3 — Base (input), Collector (bidirectional), Emitter (bidirectional)
- **Schematic symbol:** Standard BJT symbol with arrow on emitter pointing outward
- **Breadboard:** Small black TO-92 package (flat side, 3 legs)
- **Simulation:** Switch model — when base-emitter voltage > 0.7V, collector-emitter conducts (closed switch). Below threshold, open switch. Sufficient for WSG circuit where the transistor is used as a simple switch/amplifier stage.
- **Default parameters:** `{ beta: 100 }` (current gain, for future use)

### 1N914 — Signal Diode

- **Category:** active (semiconductor)
- **Pins:** 2 — Anode (bidirectional), Cathode (bidirectional)
- **Schematic symbol:** Triangle with bar (standard diode symbol)
- **Breadboard:** Small glass cylinder, orange body, black band marking cathode
- **Simulation:** Ideal diode with 0.7V forward voltage drop. Anode-cathode voltage > 0.7V → conducts with 0.7V drop. Otherwise blocks.
- **Default parameters:** `{ forwardVoltage: 0.7 }`

### Audio Output Jack

- **Category:** power (I/O)
- **Pins:** 1 — Audio input (input)
- **Schematic symbol:** Speaker/jack icon with label
- **Breadboard:** 3.5mm jack connector visual
- **Simulation:** Output component — triggers simulation activation. Reads voltage from its input net and feeds it to the AudioBridge for conversion to PC speaker output.
- **Default parameters:** `{}`

### LED

- **Category:** active (semiconductor)
- **Pins:** 2 — Anode (bidirectional), Cathode (bidirectional)
- **Schematic symbol:** Diode triangle with two small arrows indicating light emission
- **Breadboard:** Colored dome (color configurable via parameter)
- **Simulation:** Output component — triggers simulation activation. Lights up when forward voltage > ~2V. Visual state updates in both views: glowing when on (CSS filter/SVG gradient on schematic, bright radial gradient on breadboard), dim when off.
- **Default parameters:** `{ color: 'red', forwardVoltage: 2.0 }`

## Interactive Controls

### Potentiometer Adjustment

- In select mode, click and drag vertically on a potentiometer to adjust wiper position (0.0 to 1.0)
- Dragging up increases value, dragging down decreases
- Tooltip shows current value during drag (e.g., "523kOhm" for a 1MOhm pot at 0.523)
- Double-click opens text input for exact value entry
- Changes propagate to simulation immediately (real-time audio response)
- Visual feedback: arrow/wiper indicator on schematic symbol reflects position

### Resistor/Capacitor Value Editing

- Double-click a resistor or capacitor to open an inline popover editor
- Shows current value with a text input field
- Accepts common shorthand notation: "10k", "4.7M", "100n", "1u", etc.
- Enter to confirm, Escape to cancel
- Value updates propagate to simulation immediately
- Component's value label on schematic updates to reflect new value
- Same interaction pattern as potentiometer double-click for consistency

### LED Visual Feedback

- When simulation determines LED is on (forward voltage > 2V):
  - Schematic: LED symbol fills with its configured color, glow effect
  - Breadboard: dome brightens with radial gradient simulating light emission
- When off: dim/muted color in both views

## Testing Strategy

### Unit Tests

- **SimulationEngine:** net building, voltage propagation, activation/deactivation logic
- **NetAnalyzer:** union-find correctness, net grouping from connections
- **AudioBridge:** voltage-to-audio conversion with configurable supply voltage, buffer batching (128 samples)
- **UndoManager:** push/pop, stack size limits (50), redo clearing on new mutation
- **Component simulate functions:**
  - 2N3904: conducts when Vbe > 0.7V, blocks below
  - 1N914: conducts with 0.7V drop above threshold, blocks below
  - LED: on/off state based on 2V forward voltage
  - Audio Output Jack: passes voltage to AudioBridge
- **Breadboard auto-placement:** packing algorithm, IC center-channel straddling
- **Parameter parsing:** "10k" → 10000, "4.7M" → 4700000, "100n" → 0.0000001, "1u" → 0.000001

### Integration Tests

- Build WSG circuit programmatically → verify simulation produces oscillating output
- Place component in schematic → verify breadboard position assigned
- Connect Audio Output Jack → verify simulation activates
- Remove all output components → verify simulation deactivates
- Undo/redo round-trip preserves full circuit state
- Potentiometer drag updates simulation in real time
- Double-click resistor → change value → verify simulation uses new value

### Coverage Targets

- Core simulation engine: 90%+
- Circuit model: 90%+
- UI components: 70%+
- Overall project: 80%+

## Success Criteria

**Phase 3 Complete When:**
- Simulation engine runs at 48kHz when output components are connected
- Simulation idles when no outputs are connected
- Audio Output Jack plays circuit signal through PC speakers
- Breadboard view renders with moderately realistic appearance
- Components auto-place on breadboard when placed in schematic
- Wires colored by convention (red=power, black=ground, blue=signal)
- Oscilloscope panel shows real-time waveforms from probed nets (up to 4 channels)
- Potentiometers adjustable via click-drag, double-click for exact value
- Resistors and capacitors editable via double-click with shorthand notation
- LED lights up visually when forward voltage exceeded
- Undo/redo works for all circuit mutations (Ctrl+Z / Ctrl+Shift+Z)
- 2N3904, 1N914, Audio Output Jack, and LED components fully defined and tested
- Can build the Weird Sound Generator circuit and hear it through speakers
- All tests passing, zero TypeScript errors

## Phase 4 Candidates

The following features were identified during Phase 3 design as future work:

**Components:**
- SPST switch (toggle on/off)
- Speaker component (alternative audio output)
- Motor component (visual spinning output)
- Additional passive values (electrolytic capacitors, inductors)
- User-created custom components

**Infrastructure:**
- Web Worker for simulation (offload 48kHz loop from main thread)
- SharedArrayBuffer audio transport (replace PostMessage for lower latency)
- A* pathfinding for schematic wire routing (avoid crossing components)
- Manual wire waypoints for custom routing

**Features:**
- Cloud storage and user accounts (OAuth)
- Circuit sharing via URL (read-only and editable links)
- Real-time collaboration (multiple users editing)
- Import from common formats (SPICE netlists, KiCad)
- Export as PNG/SVG image of schematic
- Circuit version history and snapshots
- Mobile/tablet support with touch interactions
- Component datasheet viewer
- Circuit debugging (visual voltage indicators, step-through simulation)
- Copy/paste multiple components with connections
- User-selectable wire colors on breadboard

**Performance:**
- Maximum circuit size testing and optimization (100+ components)
- Lookup table optimization for simulation
- Component batching in simulation loop

---

**End of Phase 3 Specification**
