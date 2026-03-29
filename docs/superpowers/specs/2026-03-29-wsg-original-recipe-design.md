# WSG Original Recipe + Switch Component

## Problem

The WSG example circuit doesn't match the MFOS schematic. The LM741 op-amp is created but never connected. The 2N3904 transistor, 1N914 diode, passive filter, and Wackiness switch are all missing. Cross-coupling uses a symmetric resistive ring instead of the real asymmetric topology. The circuit needs a switch component that doesn't exist in the library.

## Scope

1. Add a new interactive SPST switch component (model + definition + UI)
2. Rewrite the WSG example to match the Original Recipe schematic
3. Register the switch in the component drawer and worklet

## 1. Switch Component

### Model (`SwitchModel`)

- Type: `'switch'`
- 2 pins (bidirectional), 0 internal nodes, 0 branches
- Parameter: `closed` (number, 0=open, 1=closed, default 0)
- When closed: stamp conductance 100 S (0.01 ohm) between pins
- When open: stamp conductance 1e-9 S (1G ohm) between pins
- Linear model, convergenceError returns 0
- Uses `stampConductance` from stampUtils

### Component Definition

- Pins: `[{ id: '1', type: 'bidirectional' }, { id: '2', type: 'bidirectional' }]`
- Default parameters: `{ closed: 0 }`
- Schematic symbol: SPST toggle switch (two terminal dots with a hinged lever)

### UI (Custom React Flow Node)

- `SwitchNode` component — same pattern as `PotentiometerNode`
- Click toggles the switch state
- Calls `onParamChange(componentId, 'closed', newValue)` to update worklet
- Visual feedback: lever drawn up (open) or down/connected (closed)
- SVG rendering inline, consistent with other custom nodes

### Registration

- Add `SwitchModel` to worklet processor registry: `reg.register('switch', () => new SwitchModel())`
- Add switch to component definitions in `src/components/definitions/`
- Add switch to the component drawer sidebar under a "CTRL" or new "SWITCHES" category

## 2. WSG Example Rewrite

All component values from the MFOS "Your First Wacky Electronic Noise Maker Thingy" schematic (Aug 2007) by Ray Wilson, Original Recipe configuration.

### Components

| Ref | Type | Value | Role |
|-----|------|-------|------|
| U1 | cd40106 | - | Three Schmitt trigger oscillators |
| U2 | lm741 | - | Inverting amplifier / output buffer |
| Q1 | 2n3904 | - | Wacky-to-Weird cross-modulation |
| D1 | 1n914 | - | Clips Wacky signal for Q1 base drive |
| S2 | switch | - | "Wackiness" on/off |
| R1 | pot | 1M | Wacky Frequency |
| R6 | resistor | 4.7K | Wacky minimum R |
| C4 | capacitor | 22nF | Wacky timing |
| R_weird | pot | 1M | Weird Frequency |
| R7 | resistor | 4.7K | Q1 collector to Weird output |
| R14 | resistor | 4.7K | Q1 emitter to Weird input |
| C5 | capacitor | 22nF | Weird timing |
| R13_pot | pot | 1M | Zany Frequency |
| R15 | resistor | 4.7K | Zany minimum R |
| C7 | capacitor | 1uF | Zany timing (slow LFO) |
| R13 | resistor | 1M | Zany-to-Wacky cross-coupling |
| R18 | pot | 100K | Zaniness Amount |
| R19 | resistor | 47K | Zaniness series R |
| R5 | resistor | 1M | Filter input |
| R3 | pot | 1M | Oddness Cut Off Frequency |
| C1 | capacitor | 100nF | Filter cap |
| R4 | resistor | 10M | Op-amp input R |
| R11 | resistor | 750K | Op-amp feedback R |
| R16 | resistor | 100K | Op-amp bias (V+ to IN+) |
| R17 | resistor | 100K | Op-amp bias (IN+ to GND) |
| R12 | resistor | 1K | Op-amp output R |
| C6 | capacitor | 1uF | Output coupling cap |
| C9 | capacitor | 100nF | Power bypass |

### Connections

**Power:**
- Power + to U1 VDD (pin 12) and U2 V+ (pin 4)
- Power - to Ground
- Ground to U1 VSS (pin 13) and U2 V- (pin 2)

**Wacky Oscillator (U1-B: input pin 1, output pin 7):**
- R1 pot: pin 0 to U1 pin 1 (input), pin 2 to U1 pin 7 (output)
- R6 (4.7K): from U1 pin 1 to U1 pin 7 (parallel with pot, sets minimum R)
- C4 (22nF): from U1 pin 1 to ground

**Weird Oscillator (U1-A: input pin 0, output pin 6):**
- R_weird pot: pin 0 to U1 pin 0 (input), pin 2 to U1 pin 6 (output)
- C5 (22nF): from U1 pin 0 to ground
- (Also modulated by Q1 — see cross-coupling)

**Zany Oscillator (U1-C: input pin 2, output pin 8):**
- R13_pot: pin 0 to U1 pin 2 (input), pin 2 to U1 pin 8 (output)
- R15 (4.7K): from U1 pin 2 to U1 pin 8 (parallel with pot)
- C7 (1uF): from U1 pin 2 to ground

**Cross-coupling — Zany to Wacky:**
- R18 pot (100K "Zaniness Amount"): pin 0 to U1 pin 8 (Zany output)
- R19 (47K): from R18 wiper (pin 1) to R13 coupling node
- R13 (1M): from R19/R18 junction to U1 pin 1 (Wacky input)

**Cross-coupling — Wacky to Weird (via D1 + S2 + Q1):**
- D1 (1N914): anode to U1 pin 7 (Wacky output), cathode to S2 pin 1
- S2 (switch): pin 1 to D1 cathode, pin 2 to Q1 base
- Q1 (2N3904): base from S2, collector to R7, emitter to R14
- R7 (4.7K): from Q1 collector to U1 pin 6 (Weird output)
- R14 (4.7K): from Q1 emitter to U1 pin 0 (Weird input)

**Filter (Oddness):**
- R5 (1M): from U1 pin 6 (Weird output) to COF1 node
- R3 pot (1M "Oddness"): pin 0 to COF1, pin 2 to ground (variable shunt)
- C1 (100nF): from COF1 to COF2 node

**LM741 Output Stage (U2):**
- R4 (10M): from COF2 to U2 IN- (pin 0)
- R11 (750K): from U2 OUT (pin 3) to U2 IN- (pin 0) — feedback
- R16 (100K): from Power + to U2 IN+ (pin 1)
- R17 (100K): from U2 IN+ (pin 1) to Ground — bias at 4.5V
- R12 (1K): from U2 OUT (pin 3) to C6
- C6 (1uF): from R12 to audio output — DC blocking

**Bypass:**
- C9 (100nF): from Power + to Ground

### Files Changed

- Create: `src/simulation/models/SwitchModel.ts`
- Create: `src/components/definitions/Switch.ts` (or add to existing definitions)
- Create: `src/views/CircuitCanvas/nodes/SwitchNode.tsx`
- Modify: `src/simulation/worklet/processor.ts` — register SwitchModel
- Modify: `src/simulation/index.ts` — export SwitchModel
- Modify: `src/examples/circuits.ts` — rewrite WSG example
- Modify: `src/views/CircuitCanvas/CircuitCanvas.tsx` — register SwitchNode
- Modify: component drawer — add switch to sidebar
- Test: `tests/simulation/models/SwitchModel.test.ts`

## Testing

- SwitchModel unit test: verify conductance stamps in open/closed states
- WSG smoke test: load WSG example, run 48000 samples (1s), verify non-NaN non-silent output
- Switch toggle test: verify parameter update changes conductance
