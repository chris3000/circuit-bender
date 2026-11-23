# Circuit Bender

Browser-based circuit simulation for creative audio / circuit bending. Built with React + TypeScript + Vite.

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run typecheck    # Type check: clean, so any error is new
npm test             # Run tests (tests/simulation/worklet/examples.test.ts runs the real example circuits)
npm run build        # Type check + production build
```

All three are clean and CI (`.github/workflows/ci.yml`, Node 24) runs them on every push to main and every pull request. Keep it that way: fix or delete a test that has gone stale rather than leaving it failing.

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

**Timing and output:** the solver takes 2 steps per audio sample (`setOversampling`), cuts a step short at each event, and restarts with a short backward-Euler step afterwards (trapezoidal otherwise). `solver/OutputSampler.ts` turns the resulting piecewise-linear signal into band-limited audio at a fixed 4× resolution, independent of the step count. Budget: the header's load indicator shows it while playing. In headless Chrome on the development machine a single oscillator reads about 4% and the WSG about 30%; three WSGs side by side reach the limit.

**Starting state:** a circuit starts at its DC operating point (`initializeState`: a backward-Euler solve with an infinite step, so capacitors are open circuits), not from 0 V. Tests that want a charging curve must step a source with `updateParam`.

**Conventions the solver relies on:**
- Every `ground` symbol is the same node, wired together or not.
- The audio jack is a 1 MΩ load to ground; its `gain` parameter is an input trim that only scales the recorded level. A rail-to-rail swing is ±0.5 at gain 1.
- Models that set `ignoresUnconnectedPins` (the CD40106) get no node for unwired pins.
- The op-amp (`OpAmpModel.ts`) is a piecewise-linear macromodel: gain-bandwidth, slew rate and output swing are parameters, all handled with events rather than Newton iteration.

### Communication

Main thread serializes circuit topology and posts it to the worklet. The worklet posts back audio samples, probe data, LED states and, twice a second, its load.

`AudioEngine.updateCircuit` decides what an edit needs: a changed circuit is reloaded (which restarts the simulation), a live control (`LIVE_PARAMETERS`: pot position, switch state, jack trim) is sent as `setParam`, and moving parts on the canvas sends nothing. Add new live controls to that table and give the model an `updateParam`.

### UI

Candy Lab + Mono Pop design system: monospace font, monochrome palette, #FF2D55 hot pink accent. Parts shelf on the left. Unified interaction (drag body = move, mousedown pin = wire).

**Three views** of one circuit (`views/viewModes.ts`; the tabs in the toolbar, Tab steps through them): schematic and board are the same React Flow canvas drawn two ways, the cover is a separate view. While the cover shows, the canvas stays mounted but out of sight (`hidden`: `visibility: hidden`, so it keeps its size, its viewport and its measured nodes) and its delete keys are switched off, because React Flow listens for them on the whole page.

**Cover** (`src/views/Cover/`): the front panel of the circuit as a finished thing — every input and output and nothing else. Nothing is stored for it: `coverLayout.ts` works the panel out from the circuit (knobs across the top, switches bottom left, lights and sockets bottom right; rows wrap, a long name widens its cell), and nothing in it knows any particular part. A part is on the cover when its definition has `cover: { control, parameter?, name, detail? }`: `knob` and `toggle` are inputs that set a live parameter (0 to 1, or 0 / 1), `lamp` follows the worklet's LED states, `pilot` (the supply) is lit while playing, `jack` has a level meter fed by `App`'s `levels` (peak of each sample block; it updates the DOM directly, not through React). Names are the parts' own labels (click one on the cover to change it), or the kind's name, numbered, until a part has one. `PanelArt.tsx` is the faceplate and its trimmings (cheeks, screws, nameplate, stripes, badge, vents), drawn like the shelf art: flat fills, one highlight, one shadow. The panel is laid out in fixed units and scaled to fit.

**Parts shelf** (`src/views/ComponentDrawer/`): built to hold many parts, and nothing in it knows any particular part. `catalog.ts` works the shelf out from the definitions: one tile per part, or one per stocked value for a part that comes in values (`value` + `shelf.stock`; `shelf.common` are the ones shown before "All N values"). Search matches name, type, caption, description, category and `shelf.keywords`, reads values however they are written (4k7, 100nF, 0.1µ), and makes up a value that is not stocked. Parts are drawn as they look in the hand (`src/components/art/partArt.tsx`; a resistor's bands come from `resistorBands`), in a 48 × 24 box, without gradients, clip paths or ids. A drag carries the type and the value's parameters (`dragData.ts`). Recent parts, folded categories and the folded shelf are remembered in localStorage.

**Part drawings** (`src/components/art/`): a part looks the same on the shelf and on the board. `partArt.tsx` has each part's body, centred on the origin and without leads (`resistorBody`, `capacitorBody`, …), and the shelf drawing built from it (`resistorArt`, …). `boardArt.tsx` draws the same bodies for the board view (`resistorBoard`, `chipBoard`, …) with leads run to wherever the definition's pins are. Pins stay where the schematic has them, so board leads are not always realistic (a disc capacitor has a leg out of each side, a chip's legs are in schematic order, not package order): the schematic's connections win over realism. A board drawing must stay inside the definition's `dimensions` plus `overhang`. `knob.ts` is the dial's sweep, shared by the board pot and the cover knob.

To add a part: write its definition and register it in `main.tsx`; it appears on the shelf, drawn with its board symbol. Draw its body once in `partArt.tsx` and use it for both `shelf.art` and the board symbol (`boardArt.tsx`). Give it `shelf: { title, caption, keywords, art }` to do better, and `value` + `shelf.stock` if it comes in values (the inspector's value field uses `value` too). If it is something the player touches or watches, give it `cover` as well; a new kind of control also needs drawing in `Cover/CoverControls.tsx`.

**Canvas** (`src/views/CircuitCanvas/`): React Flow, with the circuit in `CircuitContext` as the source of truth. `useCircuitSync` keeps React Flow's copy of the nodes:
- A drag only moves the canvas's copy; the circuit is told once, when it ends (`onNodeDragStop` → `moveComponents`, one undo step). Never dispatch to the circuit from inside a `setNodes` updater.
- Rebuilt nodes must keep the `width`/`height` React Flow measured, or every part is hidden and re-measured on each selection, knob turn or LED blink.
- Continuous edits (a knob being turned) pass `{ record: false }` to `updateComponent` after the first movement, so a turn is one undo step.
- Wires are derived from the circuit, but their selection must be taken up in `onEdgesChange`: React Flow marks its own copy selected, and ignoring that makes each click select the wire clicked the time before.

**Wires** (`routing/`): nobody draws wire paths by hand. `router.ts` routes every wire on a 10 px grid with A*; all its rules are costs (so it always finds a route): never through a part, never along another net, cross at right angles when it must, share track within a net (drawn with a junction dot), leave a pin straight out of its part. `layout.ts` is the one description of a part's geometry — pin positions and directions (`pinSide`: the nearest edge of the symbol), the room the symbol takes, where its name goes — used by both the node components and the router. A symbol that draws text outside its `dimensions` box declares it as `overhang` in its definition so wires stay off it. `tests/views/routing/router.test.ts` checks the promises on every example circuit.

**Inspector** (`src/views/Inspector/`): the panel at the top right for whatever is selected — a part's name, value, controls (pot position, switch, supply voltage, jack trim), rotation and delete, or a wire's probe. Every gesture on the canvas should also be reachable here; add new part parameters to it. It stops key events at its root so typing is not taken for canvas shortcuts.

**Wire colors** (`utils/wireColors.ts`): the user can color wires from the inspector. A color is stored on the connection (`Connection.color`, an id from `WIRE_COLORS`) but belongs to the whole net: `setWireColor` writes it to every joined wire, `resolveWireColors` draws a net in one color, and code that splits or rejoins a wire carries the color over. Each color has a shade per view. Without one, wires keep the defaults (schematic: dark; board: red power, black ground, blue signal). Colors are not sent to the simulation.

**Keeping work** (`src/storage/`, `CircuitContext`):
- `isDirty` is "the circuit object is not the one last saved or opened" (circuits are immutable, so undoing back to the saved state is clean again). Saving calls `markSaved`, which keeps the undo history.
- The canvas is autosaved to localStorage (`autosave.ts`) and restored on startup, unsaved mark included.
- Anything that puts another circuit on the canvas goes through `useReplaceCircuit()` (`views/ReplaceGuard.tsx`), which asks before discarding unsaved changes. Don't call `loadCircuit` directly from UI.
- A saved part is everything but its runtime `state`. Circuit files (`exportCircuitFile` / `importCircuitFile`) are plain JSON and are validated on the way in.

**Playing:** `utils/circuitChecks.ts` lists reasons a circuit will be silent; `PlayNotice` shows them (and a failed audio start) under the header.

**Load:** while a circuit plays, `LoadIndicator` in the header shows how much of the time available the simulation needs, and `PlayNotice` says so when the sound breaks up. The worklet measures it (`worklet/RenderLoad.ts`: time spent computing over time played; a worklet only has a millisecond clock, so a reading is good to a few points), `AudioEngine.onLoad` adds the dropouts Chrome reports (`AudioContext.playbackStats`, not in every browser), and `audio/loadStatus.ts` grades the two as `ok` / `high` (70%) / `over` (95%, or repeated dropouts) without flickering. Loading a circuit breaks the sound for a moment; dropouts are not counted for two seconds after one.

**Parts on the canvas:** all node types render through `nodes/NodeFrame.tsx`. A part can have a name (`Component.label`, e.g. the WSG's WACKY / ZANY pots): double-click it to rename, select an unnamed part to add one. Pots turn in both views (board: drag round the dial; schematic: drag the small knob up/down). Right-click a wire to probe it; drop a wire on a wire to join them with a junction.

## Key Files

- `src/simulation/solver/MNASolver.ts` — MNA solver (the simulation engine)
- `src/simulation/solver/OutputSampler.ts` — anti-aliased conversion of solver output to audio samples
- `src/simulation/models/` — one model class per component type
- `src/simulation/worklet/processor.ts` — AudioWorkletProcessor entry point
- `src/audio/AudioEngine.ts` — AudioContext + worklet communication
- `src/audio/loadStatus.ts`, `src/views/LoadIndicator.tsx` — whether the simulation is keeping up, and the header meter that shows it
- `src/App.tsx` — Root component, audio/LED/probe wiring
- `src/views/CircuitCanvas/CircuitCanvas.tsx` — React Flow circuit editor (schematic + board)
- `src/views/CircuitCanvas/useCircuitSync.ts` — circuit ↔ React Flow nodes/edges, drags, wire routes
- `src/views/CircuitCanvas/routing/` — wire router (`router.ts`) and part geometry (`layout.ts`)
- `src/views/Inspector/Inspector.tsx` — panel for the selected part or wire
- `src/views/ComponentDrawer/` — parts shelf (`catalog.ts`: what is on it and search)
- `src/views/Cover/` — the cover view (`coverLayout.ts`: what is on it and where)
- `src/components/art/` — drawings of parts, shared by the shelf (`partArt.tsx`) and the board view (`boardArt.tsx`); resistor colour code
- `src/storage/` — named saves, autosave, circuit files
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

Every example has a named switch (SOUND, SOFT, SUB, HIGHER, FAST, LOW, WACKINESS), so its cover has at least one input. Each starts in the position that plays the example as its description says, and `tests/simulation/worklet/examples.test.ts` checks that flipping it does what its name promises. Keep that true for new examples.

Checking the UI in a browser: the page must be in a visible tab. In a background tab Chrome delivers no ResizeObserver callbacks, so React Flow never measures the nodes and they stay hidden and unclickable.

## Conventions

- Colors: #222 (dark), #F5F5F5/#EBEBEB (light), #FF2D55 (accent)
- Font: `'Courier New', Courier, monospace` everywhere
- Border radius: 8-12px on interactive elements
- A part's definition (`src/components/definitions/`) is how it looks and where its pins are; how it behaves is its model in `src/simulation/models/`, registered in `worklet/processor.ts`
- Tests get an in-memory `localStorage` from `tests/setup.ts`
