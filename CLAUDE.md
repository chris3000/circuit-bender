# Circuit Bender

Browser-based circuit simulation for creative audio / circuit bending. Built with React + TypeScript + Vite.

## Quick Start

```bash
npm run dev          # Start dev server at http://localhost:5173
npm run typecheck    # Type check: clean, so any error is new
npm test             # Run tests; it watches, so use `npx vitest run` (or CI=true) for one pass (tests/simulation/worklet/examples.test.ts runs the real example circuits)
npm run build        # Type check + production build
```

All three are clean and CI (`.github/workflows/ci.yml`, Node 24) runs them on every push to main and every pull request. Keep it that way: fix or delete a test that has gone stale rather than leaving it failing.

## Architecture

### Simulation (MNA Solver)

The simulation engine is a **Modified Nodal Analysis solver** running inside an `AudioWorkletProcessor`. It lives in `src/simulation/` as TypeScript: Vite serves it as modules in dev and bundles it to a self-contained `audio-worklet-processor.js` for production (plugin in `vite.config.ts`).

**How it works:** each component is a model class (`src/simulation/models/`) that stamps itself into one shared matrix; the solver (`solver/MNASolver.ts`) solves all node voltages simultaneously. No sequential iteration or special-case hacks. `models/standardModels.ts` registers every model by its definition's `type`; the worklet and the tests both build their solver from it.

**Key principle:** All components must simulate through the same MNA path. No component-specific voltage propagation.

**Model interface** (`models/ComponentModel.ts`) — stamps are split by how often they change:
- `stampMatrix` — anything that doesn't depend on the solution (conductances, companion models). The solver inverts the matrix once per discrete circuit state and caches it, so don't read `x` here.
- `stampRhs` — per-step right-hand side (source values, capacitor history).
- `stampNonlinear` + `getNonlinearNodes` — x-dependent stamps (diodes, BJTs). Newton iteration is confined to the declared nodes. Stamp the full Jacobian, limit junction voltages against the previous *iteration*, and have `convergenceError` return 0 once the linearization predicts the device currents at the new solution (see `junctionUtils.ts`).
- `findEvent` / `applyEvent` / `getDiscreteState` — discrete switching (Schmitt gate flips, clamps). Never switch state inside a stamp or `postStep`: report where in the step it happens and the solver moves to that instant. This is what gives edges sub-sample timing.
- `syncState(x, elapsed?)` — put the model's own state on the solution `x` when a step is abandoned or cut at an event. `elapsed` is how much time went by in getting there (it may be 0), and is left out when the circuit is being put at its starting point. A model that keeps time (the signal source, the opto-coupler's cell) advances its clock in `postStep(x, dt)` and here, and nowhere else.
- `watchFeedback(response)` — for a part with gain round a node of its own. Before each step the solver says how that node answers a current pushed into it (the diagonal of the inverse). A negative answer means positive feedback faster than the step, which backward Euler would hold still for good: the part must make the move itself, as an event. Only the op-amp uses it (below).
- `current(x)` / `strain(x)` — optional, read-only, for the instruments (below): the current through a two-pin part (first pin to second, amps), and how hard the part is driven as a fraction of what a real one stands (resistor: ¼ W; LED: 30 mA; 1N914: 200 mA; supply: 1 A). Over 1 is overloaded. Neither changes how anything simulates: an overloaded part carries on, with a "!" on it.

**Timing and output:** the solver takes 2 steps per audio sample (`setOversampling`), cuts a step short at each event, and restarts with a short backward-Euler step afterwards (trapezoidal otherwise). `solver/OutputSampler.ts` turns the resulting piecewise-linear signal into band-limited audio at a fixed 4× resolution, independent of the step count. Budget: the header's load indicator shows it while playing. In headless Chrome on the development machine a single oscillator reads about 4% and the WSG about 30%; three WSGs side by side reach the limit.

**Starting state:** a circuit starts at its DC operating point (`initializeState`: a backward-Euler solve with an infinite step, so capacitors are open circuits), not from 0 V. Tests that want a charging curve must step a source with `updateParam`.

**Conventions the solver relies on:**
- Every `ground` symbol is the same node, wired together or not.
- What is heard is the sum of every model with an `audioTap()`: Audio Out (a 1 MΩ load to ground), the bare `speaker` (8 Ω between its two pins, so it needs something that can drive it: a 555, an LM386) and the piezo disc (the voltage across it). Audio Out's `gain` parameter is an input trim that only scales the recorded level. A rail-to-rail swing is ±0.5 at gain 1.
- Models that set `ignoresUnconnectedPins` (the logic chips: CD40106, CD4093, CD4040, CD4017, CD4013, CD4049; and the LM324, TL072 and LM13700, where a whole unused amplifier is left out) get no node for unwired pins. So an output with nothing on it reads 0 V: give it a load in a test. Their definitions say the same with `floatingPins`, which is how the bend tool knows an unused leg is dead; `partsAndModels.test.ts` checks the two agree.
- The op-amp (`OpAmpModel.ts`) is a piecewise-linear macromodel: gain-bandwidth, slew rate and output swing are parameters, all handled with events rather than Newton iteration. The LM741, and each amplifier of an LM324 or a TL072 (`MultiOpAmpModel.ts`), is one of these with its own parameters. Two things it does that are easy to break:
  - What an output delivers is drawn from the supply pins, half from each. A "virtual ground" that is only two resistors across a battery (the Noise Toaster's) is then left alone by the loads the amplifiers drive.
  - With positive feedback (a Schmitt trigger, a comparator with hysteresis, the square half of a triangle oscillator) it snaps: `watchFeedback` tells it its gain node has run away, and an event puts the input stage hard over until a rail is reached. Without this such a circuit sits on its balance point for ever, because the step is ten times longer than the snap. At the starting point a snap goes straight to the rail.
- A supply with a rail above ground and one below is two `power` parts in a row, the + of the second on ground.
- The LM386 (`PowerAmpModel.ts`) is built the same way; the 555 (`Timer555Model.ts`) and the CMOS chips (`CmosChipModel.ts`: one base class, a subclass per chip) are flip-flops and counters switched by events.
- The supply (`PowerSourceModel.ts`) has a `starve` control: a series resistance (0 to 1 MΩ on a log sweep) with 100 nF across the output. The capacitor is what makes a starved CMOS oscillator well-posed; do not take it out. Chips work down to 0.1 V and have no supply-dependent output resistance, so starving raises pitch and cross-modulates oscillators rather than slowing them.
- A bend (`MNASolver.setBend`) is a conductance between two nodes, stamped with the matrix. It is not part of the circuit and loading a circuit drops it.
- The parts with curves are Newton models built from `deviceUtils.ts` (`Junction`, `channelCurrent`, `stampDependentCurrent`): the CD4049 (`CmosInverterModel.ts`: a real N and P transistor per inverter, so it is an amplifier when biased with a feedback resistor, with a gain of about 25), the 2N5457 (`JFETModel.ts`), the LM13700 (`OtaModel.ts`: output current = bias current × tanh(input / 52 mV), a bias pin two diode drops above V−, a buffer two drops below its input) and the two transistors (`BJTModel.ts`; `polarity: 'pnp'` is the 2N3906).
- A 2N3904's base-emitter junction breaks down at 7.2 V backwards and hisses while it does (`BVEB`, `noise`): that is the Noise Toaster's noise source, and the level is set so Wilson's circuit gives his 1.5 V peak to peak. Used the ordinary way a transistor is silent.
- Audio In (`SignalSourceModel.ts`) is a voltage behind 600 Ω. Its `wave` parameter is a number, the place in `SIGNAL_WAVES` (models are only given numbers). The edges of its square and saw are events.
- The opto-coupler's cell (`OptoCouplerModel.ts`) follows the LED's current with a lag, so it is stamped as it stood at the start of the step, in `stampNonlinear` (it changes every step; in the matrix it would force a new inverse each time).
- The LED (`DIODE_LED_RED_PARAMS`) has 5 Ω in series, like a real one. Without it an LED straight across the supply does not converge. It drops about 1.9 V at 1 mA and 2.2 V at 15 mA.

**Measuring** (`src/simulation/measure/`): `signal.ts` reads a signal as a meter does (level, swing, frequency): `measureSignal` for a recorded trace, `SignalMeter` for one that is arriving. `bench.ts` (`runOnBench`) runs a serialized circuit by itself through the same solver and models and reports currents, voltages, strain and the sound. Classes check the learner's circuit with it, and tests can use it instead of stepping a solver by hand.

### Communication

Main thread serializes circuit topology (`utils/serializeCircuit.ts`) and posts it to the worklet. The worklet posts back audio samples, probe data, what its instruments see and, twice a second, its load.

**Instruments** (`worklet/Instruments.ts`, one `instruments` message, heard through `AudioEngine.onInstruments`): the current through each LED (60 a second), the list of overloaded parts (when it changes; strain is averaged over a quarter of a second, so a blink does not flag), and the meter (8 a second): a reading for each scope probe and for one target set with `AudioEngine.setMeter`, a pin or a two-pin part. `App` turns LED currents into brightness (`utils/ledLight.ts`: 0 to 1 in steps, steep at the bottom as the eye is) and passes `lights` down as a prop; the overloaded set and the meter go through `InstrumentsContext` (`views/Instruments.tsx`). The meter's target is whatever single wire or two-pin part is selected (`utils/meterTarget.ts`). Readings are written with `utils/readings.ts`.

`AudioEngine.updateCircuit` decides what an edit needs: a changed circuit is reloaded (which restarts the simulation), a live control (`LIVE_PARAMETERS`: pot position, switch and button state, a changeover's throw, starve, light, touch, a piezo's tap, the audio input's wave, pitch and level, amplifier gain, output trim) is sent as `setParam`, and moving parts on the canvas sends nothing. Add new live controls to that table and give the model an `updateParam`; anything a definition's `cover` or `control` sets must be in it (tested). `AudioEngine.setBend` holds or releases a jumper in the running circuit without a reload.

### UI

Candy Lab + Mono Pop design system: monospace font, monochrome palette, #FF2D55 hot pink accent. Parts shelf on the left. Unified interaction (drag body = move, mousedown pin = wire).

**Three views** of one circuit (`views/viewModes.ts`; the tabs in the toolbar, Tab steps through them): schematic and board are the same React Flow canvas drawn two ways, the cover is a separate view. While the cover shows, the canvas stays mounted but out of sight (`hidden`: `visibility: hidden`, so it keeps its size, its viewport and its measured nodes) and its delete keys are switched off, because React Flow listens for them on the whole page.

**Cover** (`src/views/Cover/`): the front panel of the circuit as a finished thing — every input and output and nothing else. Nothing is stored for it: `coverLayout.ts` works the panel out from the circuit (knobs across the top, switches bottom left, lights and sockets bottom right; rows wrap, a long name widens its cell), and nothing in it knows any particular part. A part is on the cover when its definition has `cover: { control, parameter?, name, detail? }` (or a list of them: the supply is a pilot light and a STARVE knob; `when` picks by the part's parameters, `fixedName` is a name the player cannot change): `knob` and `toggle` are inputs that set a live parameter (0 to 1, or 0 / 1), `button` and `pad` (touch plates; higher up is a firmer touch) are on only while held and are not undo steps, `lamp` follows the worklet's LED states, `pilot` (the supply) is lit while playing, `speaker` and `jack` have a level meter fed by `App`'s `levels` (peak of each sample block; it updates the DOM directly, not through React). Audio Out is a small speaker on the cover: it plays straight to the computer's speakers. Its `destination: 'line'` parameter (`utils/audioOut.ts`) is reserved for sending the signal somewhere else, and shows the jack instead; nothing sets it yet. Names are the parts' own labels (click one on the cover to change it), or the kind's name, numbered, until a part has one. `PanelArt.tsx` is the faceplate and its trimmings (cheeks, screws, nameplate, stripes, badge, vents), drawn like the shelf art: flat fills, one highlight, one shadow. The panel is laid out in fixed units and scaled to fit.

**Parts shelf** (`src/views/ComponentDrawer/`): built to hold many parts, and nothing in it knows any particular part. `catalog.ts` works the shelf out from the definitions: one tile per part, or one per stocked value for a part that comes in values (`value` + `shelf.stock`; `shelf.common` are the ones shown before "All N values"). Search matches name, type, caption, description, category and `shelf.keywords`, reads values however they are written (4k7, 100nF, 0.1µ), and makes up a value that is not stocked. Parts are drawn as they look in the hand (`src/components/art/partArt.tsx`; a resistor's bands come from `resistorBands`), in a 48 × 24 box, without gradients, clip paths or ids. A drag carries the type and the value's parameters (`dragData.ts`). Recent parts, folded categories and the folded shelf are remembered in localStorage.

**Part drawings** (`src/components/art/`): a part looks the same on the shelf and on the board. `partArt.tsx` has each part's body, centred on the origin and without leads (`resistorBody`, `capacitorBody`, …), and the shelf drawing built from it (`resistorArt`, …). `boardArt.tsx` draws the same bodies for the board view (`resistorBoard`, `chipBoard`, …) with leads run to wherever the definition's pins are. Pins stay where the schematic has them, so board leads are not always realistic (a disc capacitor has a leg out of each side, a chip's legs are in schematic order, not package order): the schematic's connections win over realism. A board drawing must stay inside the definition's `dimensions` plus `overhang`. `knob.ts` is the dial's sweep, shared by the board pot and the cover knob.

To add a part: write its definition and register it in `main.tsx` and `tests/views/allParts.ts`, and its model in `standardModels.ts`; it appears on the shelf, drawn with its board symbol. A chip gets its schematic box, pin labels and board body from `art/chipSymbol.tsx` (`chipViews`). Draw its body once in `partArt.tsx` and use it for both `shelf.art` and the board symbol (`boardArt.tsx`). Give it `shelf: { title, caption, keywords, art }` to do better, and `value` + `shelf.stock` if it comes in values (the inspector's value field uses `value` too). If it is something the player touches or watches, give it `cover` as well; a new kind of control also needs drawing in `Cover/CoverControls.tsx`. If it can be worked on the canvas too, give it `control` (`dial`: a small knob beside the symbol; `hold`: the symbol is pressed) and `nodes/ControlNode.tsx` and the inspector draw it. Two more things a definition says about editing: `through: [a, b]`, the two pins a wire runs through the part by (in by one, out by the other; a two-pin part needs none, a part with no way through, like the supply, has none), and `shelf.alike`, the kinds of thing it is (`'resistance'`, `'switch'`, …): parts that share one are offered in each other's place.

**Canvas** (`src/views/CircuitCanvas/`): React Flow, with the circuit in `CircuitContext` as the source of truth. `useCircuitSync` keeps React Flow's copy of the nodes:
- A drag only moves the canvas's copy; the circuit is told once, when it ends (`onNodeDragStop` → `moveComponents`, one undo step). Never dispatch to the circuit from inside a `setNodes` updater.
- Rebuilt nodes must keep the `width`/`height` React Flow measured, or every part is hidden and re-measured on each selection, knob turn or LED blink.
- Continuous edits (a knob being turned) pass `{ record: false }` to `updateComponent` after the first movement, so a turn is one undo step.
- Selection lives in `CircuitContext` and is taken up from the `select` changes React Flow reports (`onNodesChange`, `onEdgesChange`), at once. Do not use React Flow's `onSelectionChange`: it also fires when the selection it is given changes, and a part that edits the circuit when clicked (a switch) then flips the selection hundreds of times a second for good.
- Wires are derived from the circuit, but their selection must be taken up in `onEdgesChange`: React Flow marks its own copy selected, and ignoring that makes each click select the wire clicked the time before.
- `connectionMode` is loose: a pin is one handle, and a wire may be dropped on the pin itself, not only beside it.
- A circuit is fitted to the view once, when it arrives with parts on it. One that arrives empty (a class starting) is not: the first part must stay where it was dropped.
- A change that touches several things at once (a part and its wires) goes through `editCircuit((circuit) => …)`: one function from circuit to circuit, one undo step, nothing recorded if it returns the same circuit.
- Delete and Backspace are the canvas's own (`deleteSelection`, a `keydown` listener in `CircuitCanvas`; `deleteKeyCode={null}`). React Flow's delete reports wires and parts separately, wires first, which cannot be one edit.

**Editing by wire** (`utils/circuitEdits.ts` is the pure part, with `tests/utils/circuitEdits.test.ts`):
- A part let go of on a wire goes into it (`spliceIntoWire`): the wire is cut and its ends take the part's `through` pins. `CircuitCanvas/splice.ts` (`placeOnWire`) says which wire (within `SPLICE_REACH` of it as drawn), turns a two-pin part to lie along it and slides it exactly onto it, and picks which end takes which leg. It works from the shelf and for a part on the canvas that has no wires yet; the wire lights up while the part is held over it (`edges/spliceTarget.ts`), and is routed as if the held part were not there (`useCircuitSync`'s `floating`). Drag data cannot be read during `dragover`, so `dragData.ts` remembers the part in the air (`partInTheAir`).
- Deleting a part that sat in a wire closes the wire (`removeFromCircuit`), but only when that is what taking the part out and twisting the ends together would mean: both through pins wired, no other pin in use (supply pins aside), and nothing else already reaching both sides. So a feedback resistor, a capacitor to ground or the last part across the supply just goes. A wire deleted with the part is not closed.
- Double-click a part (or the inspector's Replace) to swap it (`views/ReplacePart/`): `ReplacePopover` beside the part has a box for typing a value, its other common values and the parts like it (`catalog.replacementsFor`); "All parts" hands over to the shelf, whose tiles are then clicked, not dragged, and greyed out when the part has fewer legs than there are wires (`fitsInPlaceOf`). `replacePart` keeps position, rotation, name and wires: legs are matched by label, then the through pair, then the next free pin of the same type. The canvas does not zoom on double-click; double-clicking a name still renames.

**Wires** (`routing/`): nobody draws wire paths by hand. `router.ts` routes every wire on a 10 px grid with A*; all its rules are costs (so it always finds a route): never through a part, never along another net, cross at right angles when it must, share track within a net (drawn with a junction dot), leave a pin straight out of its part. `layout.ts` is the one description of a part's geometry — pin positions and directions (`pinSide`: the nearest edge of the symbol), the room the symbol takes, where its name goes — used by both the node components and the router. A symbol that draws text outside its `dimensions` box declares it as `overhang` in its definition so wires stay off it. `tests/views/routing/router.test.ts` checks the promises on every example circuit.

**Bend tool** (`CircuitCanvas/BendTool.tsx`, `bend.ts`; the BEND button or B, Esc to leave): while it is on, pressing on a pin or wire picks up one end of a jumper, and holding the other end on a different net joins the two in the playing circuit (`onBend` → `AudioEngine.setBend`) through a wire, 10 kΩ or a finger's half megohm; letting go takes it away. Nothing is stored and nothing is an undo step, and parts cannot be moved or wired meanwhile. "Keep it as a switch / button" (`keptBend`) adds the part, with the jumper's resistor in line, clear of the parts already there, as one undo step (`addParts`). `bend.ts` is the pure part: nets (`netsOfPins`), what is under the pointer (`bendTargetAt`), where a kept bend goes. It converts pointer positions itself: React Flow's `screenToFlowPosition` snaps to the 20 px grid, which is coarser than a pin.

**Inspector** (`src/views/Inspector/`): the panel at the top right for whatever is selected — a part's name, value, controls (pot position, switch, supply voltage, jack trim), rotation and delete, or a wire's probe. Every gesture on the canvas should also be reachable here; add new part parameters to it. It stops key events at its root so typing is not taken for canvas shortcuts.

**Wire colors** (`utils/wireColors.ts`): the user can color wires from the inspector. A color is stored on the connection (`Connection.color`, an id from `WIRE_COLORS`) but belongs to the whole net: `setWireColor` writes it to every joined wire, `resolveWireColors` draws a net in one color, and code that splits or rejoins a wire carries the color over. Each color has a shade per view. Without one, wires keep the defaults (schematic: dark; board: red power, black ground, blue signal). Colors are not sent to the simulation.

**Keeping work** (`src/storage/`, `CircuitContext`):
- `isDirty` is "the circuit object is not the one last saved or opened" (circuits are immutable, so undoing back to the saved state is clean again). Saving calls `markSaved`, which keeps the undo history.
- The canvas is autosaved to localStorage (`autosave.ts`) and restored on startup, unsaved mark included.
- Anything that puts another circuit on the canvas goes through `useReplaceCircuit()` (`views/ReplaceGuard.tsx`), which asks before discarding unsaved changes. Don't call `loadCircuit` directly from UI. Pass `{ unsaved: true }` for a circuit that is not a copy of anything kept (a class's finished circuit).
- A saved part is everything but its runtime `state`. Circuit files (`exportCircuitFile` / `importCircuitFile`) are plain JSON and are validated on the way in.

**Undo:** the circuit's history is in `CircuitContext` (50 steps; opening another circuit starts it again, saving keeps it). The arrows are in the toolbar of every view. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y) are heard for the whole page (`context/useUndoShortcuts.ts`, mounted by `App`, in the capture phase like Space), so they work wherever the last click was. No view listens for them itself. A text box being typed in keeps them for its own typing; one whose text is already in the circuit says so with `data-settled` (the inspector's fields) and gives them to the circuit. One gesture is one step: anything that changes several things goes through `editCircuit` with a function from `utils/circuitEdits.ts` (`joinAtWire`, `rotateParts`, …), never through several calls in a row.

**Playing:** the play button, or Space anywhere except in a text field or while a dialog is open (`utils/keyboard.ts`; `App` hears it in the capture phase so no panel swallows it, and React Flow's own Space-to-pan is switched off). `utils/circuitChecks.ts` lists reasons a circuit will be silent; `PlayNotice` shows them (and a failed audio start) under the header.

**Load:** while a circuit plays, `LoadIndicator` in the header shows how much of the time available the simulation needs, and `PlayNotice` says so when the sound breaks up. The worklet measures it (`worklet/RenderLoad.ts`: time spent computing over time played; a worklet only has a millisecond clock, so a reading is good to a few points), `AudioEngine.onLoad` adds the dropouts Chrome reports (`AudioContext.playbackStats`, not in every browser), and `audio/loadStatus.ts` grades the two as `ok` / `high` (70%) / `over` (95%, or repeated dropouts) without flickering. Loading a circuit breaks the sound for a moment; dropouts are not counted for two seconds after one.

**Seeing what the circuit does:** an LED is as bright as its current, in both canvas views and on the cover (`light`, 0 to 1). A part driven harder than a real one would stand gets a pink "!" (`NodeFrame`), and the inspector says why in the words of the definition's `overload`. The inspector's meter reads the selected wire (volts, and hertz if it has any) or two-pin part (amps through, volts across) while the circuit plays. Each scope probe shows the same reading beside its name; the scope sweeps from 1 ms to 1 s a division and keeps 10 seconds (`Oscilloscope/trace.ts` draws each column as the band between its lowest and highest sample).

**Parts on the canvas:** all node types render through `nodes/NodeFrame.tsx`. A part can have a name (`Component.label`, e.g. the WSG's WACKY / ZANY pots): double-click the name to rename, select an unnamed part to add one. Pots turn in both views (board: drag round the dial; schematic: drag the small knob up/down). Right-click a wire to probe it; drop a wire on a wire to join them with a junction.

### Classes

A course that teaches circuits from nothing, taken in the app: the syllabus and each class's design are in `docs/superpowers/specs/2026-11-23-tutorial-classes-design.md` (14 classes, 5 units). Class 1 is built and is the pattern for the rest.

- A class is data (`src/classes/types.ts`, `ClassDefinition`), always in the same six parts (`SECTIONS`): BUILD (steps, each with a `done(work)`), WHY, TRY (experiments: a question, a guess, a change to make, and the result read off the learner's circuit), CHECK (a goal the app measures), KEEP (name it, cover, save) and WORDS. `circuit()` builds the finished circuit, for "Stuck?" and for tests.
- `Work` (`src/classes/Work.ts`) is the learner's circuit as a class sees it: `parts`, `net` / `joined` / `grounded` / `wired` (every ground is one net), and `run()`, the circuit on the bench (cached per circuit, since circuits are immutable). Measure with every switch closed where a step is about the circuit and not about the switch.
- The UI (`src/views/Classes/`): `ClassesMenu` in the header lists `SYLLABUS` (a class without a definition shows SOON), `ClassPanel` is a column to the right of the canvas, `ClassesContext` holds progress (`src/classes/progress.ts`, localStorage). Starting a class puts an empty circuit named for it on the canvas.
- Rules the panel keeps: a step once done stays done; an experiment shows its result only after a guess, and keeps the text it showed; the check only counts while CHECK is showing.
- Rules for writing one: short sentences, no term before it is introduced, no dashes. A class never quotes a number its test does not measure: `tests/classes/theLoop.test.ts` measures every figure in class 1 on the class's own circuit, and tries every step, experiment and check against circuits a learner might have. Write the same for each new class.
- To add a class: write `src/classes/<name>.ts`, add it to `CLASSES` in `src/classes/index.ts`, and give its `SYLLABUS` entry the same `id`.

## Key Files

- `src/simulation/solver/MNASolver.ts` — MNA solver (the simulation engine)
- `src/simulation/solver/OutputSampler.ts` — anti-aliased conversion of solver output to audio samples
- `src/simulation/models/` — one model class per component type; `standardModels.ts` registers them all; `deviceUtils.ts` has what the Newton models share
- `src/simulation/worklet/processor.ts` — AudioWorkletProcessor entry point
- `src/simulation/worklet/Instruments.ts` — LED currents, overloaded parts and the meter, measured in the worklet
- `src/simulation/measure/` — reading a signal (`signal.ts`) and running a circuit offline (`bench.ts`)
- `src/audio/AudioEngine.ts` — AudioContext + worklet communication
- `src/audio/loadStatus.ts`, `src/views/LoadIndicator.tsx` — whether the simulation is keeping up, and the header meter that shows it
- `src/App.tsx` — Root component, audio/LED/probe wiring
- `src/views/CircuitCanvas/CircuitCanvas.tsx` — React Flow circuit editor (schematic + board)
- `src/views/CircuitCanvas/useCircuitSync.ts` — circuit ↔ React Flow nodes/edges, drags, wire routes
- `src/views/CircuitCanvas/routing/` — wire router (`router.ts`) and part geometry (`layout.ts`)
- `src/views/CircuitCanvas/BendTool.tsx`, `bend.ts` — the bend tool
- `src/utils/circuitEdits.ts`, `src/views/CircuitCanvas/splice.ts` — a part into a wire, a part out of one, one part in another's place
- `src/context/CircuitContext.tsx`, `src/context/useUndoShortcuts.ts` — the circuit, its undo history, and the undo keys
- `src/views/ReplacePart/` — swapping a part: the list beside it, and the shelf as a picker
- `src/views/Inspector/Inspector.tsx` — panel for the selected part or wire
- `src/views/ComponentDrawer/` — parts shelf (`catalog.ts`: what is on it and search)
- `src/views/Cover/` — the cover view (`coverLayout.ts`: what is on it and where)
- `src/components/art/` — drawings of parts, shared by the shelf (`partArt.tsx`) and the board view (`boardArt.tsx`); resistor colour code
- `src/storage/` — named saves, autosave, circuit files
- `src/components/definitions/` — Component type definitions
- `src/examples/circuits.ts` — Example circuit builders (`place`, `resistor`, `ground`, `connect`, `namedSwitch` are shared with the classes and tests)
- `src/classes/` — the classes (`theLoop.ts`), the course (`syllabus.ts`), `Work.ts`, progress
- `src/views/Classes/` — the classes menu and the panel beside the canvas
- `src/views/Instruments.tsx` — context for the overloaded parts and the meter

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
| speaker | + | − | | |
| led | A (anode) | K (cathode) | | |
| pushbutton, ldr, body-contact | 1 | 2 | | |
| ne555 | TRIG | THRES | RESET | CTRL (3), DISCH (4), OUT (5), VCC (6), GND (7) |
| cd4093 | A1, B1 … A4, B4 (0-7) | Y1–Y4 (8-11) | VDD (12) | VSS (13) |
| cd4040 | CLK | RST | Q1–Q12 (2-13) | VDD (14), VSS (15) |
| cd4017 | CLK | INH | RST | Q0–Q9 (3-12), CO (13), VDD (14), VSS (15) |
| lm386 | IN− | IN+ | GND | OUT (3), VS (4) |
| audio-input | OUT | | | |
| piezo | + | − | | |
| spdt | COM | A | B | |
| optocoupler | A (LED) | K (LED) | 1 (cell) | 2 (cell) (3) |
| 1n4004 | A (anode) | K (cathode) | | |
| 2n3906 | B | C | E | |
| 2n5457 | G | D | S | |
| cd4049 | 1A–6A (0-5) | 1Y–6Y (6-11) | VDD (12) | VSS (13) |
| cd4013 | D1, CLK1, SET1, RST1 (0-3) | D2, CLK2, SET2, RST2 (4-7) | Q1, /Q1, Q2, /Q2 (8-11) | VDD (12), VSS (13) |
| tl072 | 1−, 1+, 1OUT (0-2) | 2−, 2+, 2OUT (3-5) | V+ (6) | V− (7) |
| lm324 | n−, n+, nOUT for n = 1–4 (0-11) | V+ (12) | V− (13) | |
| lm13700 | 1+, 1−, 1D, 1IABC, 1OUT, 1BIN, 1BOUT (0-6) | the same for 2 (7-13) | V+ (14) | V− (15) |

The CD4040 counts on the falling edge of its clock, the CD4017 on the rising edge. A CD4013 takes its D input on the rising edge.

### Parts from the two books

The parts list follows what the circuits in two books need (PDFs in `docs.local/`, not in the repository): Nicolas Collins, *Handmade Electronic Music*, and Ray Wilson, *Make: Analog Synthesizers*. `tests/simulation/solver/bookParts.test.ts` builds the books' own circuits from them (the inverter preamp and distortion, the Low Rider, the LED and photocell, the contact microphone; op-amps on two batteries and about a virtual ground, the LFO, the white noise generator of figure 6-6, the JFET as a resistor, the LM13700 as a VCA, the flip-flop as a divider) and checks the figures the books give.

Left out on purpose, with what to use instead: the LM386's gain pins (its `gain` parameter), a centre-off changeover (a changeover and a switch in a row), separate left and right outputs (every output is added into one), a switched jack, the phototransistor (the LDR or the opto-coupler), the 7809 regulator (set the supply's voltage), the output transformer and the electret capsule (Audio In stands for any microphone).

## Testing Circuits

Load examples from the header menu. The simulation needs play (▶) to be active. Right-click wires to add oscilloscope probes.

Every example has a named switch (SOUND, SOFT, SUB, HIGHER, FAST, LOW, DEEP, DRONE, BASS, SHORT, WACKINESS), so its cover has at least one input. Each starts in the position that plays the example as its description says, and `tests/simulation/worklet/examples.test.ts` checks that flipping it does what its name promises. Keep that true for new examples.

A circuit with an LED and no audio output is a light, not a mistake: `circuitChecks` does not warn about the missing output.

Checking the UI in a browser: the page must be in a visible tab. In a background tab Chrome delivers no ResizeObserver callbacks, so React Flow never measures the nodes and they stay hidden and unclickable.

## Conventions

- Colors: #222 (dark), #F5F5F5/#EBEBEB (light), #FF2D55 (accent)
- Font: `'Courier New', Courier, monospace` everywhere
- Border radius: 8-12px on interactive elements
- A part's definition (`src/components/definitions/`) is how it looks and where its pins are; how it behaves is its model in `src/simulation/models/`, registered in `models/standardModels.ts`
- Tests get an in-memory `localStorage` from `tests/setup.ts`
