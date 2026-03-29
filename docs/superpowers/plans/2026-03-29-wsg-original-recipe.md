# WSG Original Recipe + Switch Component — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive SPST switch component and rewrite the WSG example to match the MFOS Original Recipe schematic with proper cross-coupling, passive filter, and LM741 output stage.

**Architecture:** New SwitchModel for simulation (conductance toggle), new component definition + custom React Flow node for UI, then rewrite `circuits.ts` WSG entry with all connections matching the schematic.

**Tech Stack:** TypeScript, React, React Flow, Vitest

**Spec:** `docs/superpowers/specs/2026-03-29-wsg-original-recipe-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/simulation/models/SwitchModel.ts` | Simulation model: conductance toggle |
| `src/components/definitions/Switch.tsx` | Component definition: pins, symbol, metadata |
| `src/views/CircuitCanvas/nodes/SwitchNode.tsx` | Custom React Flow node: clickable toggle |
| `src/views/CircuitCanvas/nodes/index.ts` | Register SwitchNode in nodeTypes |
| `src/simulation/worklet/processor.ts` | Register SwitchModel in worklet registry |
| `src/simulation/index.ts` | Export SwitchModel |
| `src/main.tsx` | Register switchDefinition |
| `src/examples/circuits.ts` | Rewrite WSG example |
| `tests/simulation/models/SwitchModel.test.ts` | Unit tests |

---

## Task 1: SwitchModel (Simulation)

**Files:**
- Create: `src/simulation/models/SwitchModel.ts`
- Test: `tests/simulation/models/SwitchModel.test.ts`
- Modify: `src/simulation/worklet/processor.ts`
- Modify: `src/simulation/index.ts`

- [ ] **Step 1: Write SwitchModel test**

```typescript
// tests/simulation/models/SwitchModel.test.ts
import { describe, it, expect } from 'vitest';
import { SwitchModel } from '@/simulation/models/SwitchModel';

describe('SwitchModel', () => {
  it('has 0 internal nodes and 0 branches', () => {
    const m = new SwitchModel();
    expect(m.getInternalNodeCount()).toBe(0);
    expect(m.getBranchCount()).toBe(0);
  });

  it('stamps high conductance when closed', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, { closed: 1 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    // Closed: 100 S (0.01 ohm)
    expect(G[0][0]).toBeCloseTo(100, 0);
    expect(G[0][1]).toBeCloseTo(-100, 0);
  });

  it('stamps near-zero conductance when open', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, { closed: 0 });
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    // Open: 1e-9 S (1G ohm)
    expect(G[0][0]).toBeCloseTo(1e-9, 12);
  });

  it('defaults to open when no param given', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, {});
    const G = [new Float64Array(2), new Float64Array(2)];
    const b = new Float64Array(2);
    m.stamp(G, b, new Float64Array(2), 1 / 48000);
    expect(G[0][0]).toBeCloseTo(1e-9, 12);
  });

  it('convergenceError returns 0', () => {
    const m = new SwitchModel();
    m.init([0, 1], 0, 0, {});
    expect(m.convergenceError(new Float64Array(2), new Float64Array(2))).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/simulation/models/SwitchModel.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SwitchModel**

```typescript
// src/simulation/models/SwitchModel.ts
import type { ComponentModel } from './ComponentModel';
import { stampConductance } from './stampUtils';

const G_CLOSED = 100;    // 0.01 ohm when closed
const G_OPEN = 1e-9;     // 1G ohm when open

export class SwitchModel implements ComponentModel {
  readonly type = 'switch';
  private n0 = -1;
  private n1 = -1;
  private closed = false;

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
    this.closed = (params.closed ?? 0) >= 1;
  }

  stamp(G: Float64Array[], _b: Float64Array, _x: Float64Array, _dt: number): void {
    stampConductance(G, this.n0, this.n1, this.closed ? G_CLOSED : G_OPEN);
  }

  postStep(_x: Float64Array, _dt: number): void {}
  convergenceError(_xOld: Float64Array, _xNew: Float64Array): number { return 0; }
  reset(): void {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/simulation/models/SwitchModel.test.ts`
Expected: PASS

- [ ] **Step 5: Register SwitchModel in worklet processor and index**

Add to `src/simulation/worklet/processor.ts` — import and register:

```typescript
import { SwitchModel } from '../models/SwitchModel';
```

Inside `createRegistry()`, add:

```typescript
reg.register('switch', () => new SwitchModel());
```

Add to `src/simulation/index.ts`:

```typescript
export { SwitchModel } from './models/SwitchModel';
```

- [ ] **Step 6: Commit**

```bash
git add src/simulation/models/SwitchModel.ts tests/simulation/models/SwitchModel.test.ts \
  src/simulation/worklet/processor.ts src/simulation/index.ts
git commit -m "feat: SPST switch simulation model — conductance toggle"
```

---

## Task 2: Switch Component Definition + UI

**Files:**
- Create: `src/components/definitions/Switch.tsx`
- Create: `src/views/CircuitCanvas/nodes/SwitchNode.tsx`
- Modify: `src/views/CircuitCanvas/nodes/index.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create switch component definition**

```tsx
// src/components/definitions/Switch.tsx
import type { ComponentDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';

export const switchDefinition: ComponentDefinition = {
  type: 'switch',
  metadata: {
    name: 'Switch',
    category: 'control',
    description: 'SPST toggle switch — click to open/close',
  },
  pins: [
    {
      id: generatePinId('switch', 0),
      label: '1',
      type: 'bidirectional',
      position: { x: -25, y: 0 },
    },
    {
      id: generatePinId('switch', 1),
      label: '2',
      type: 'bidirectional',
      position: { x: 25, y: 0 },
    },
  ],
  defaultParameters: {
    closed: 0,
    value: 'SPST',
  },
  schematic: {
    symbol: {
      width: 50,
      height: 30,
      render: (params) => {
        const closed = (params.closed as number) >= 1;
        return (
          <g>
            {/* Left terminal */}
            <line x1="-25" y1="0" x2="-10" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="-10" cy="0" r="3" fill="currentColor" />
            {/* Right terminal */}
            <line x1="10" y1="0" x2="25" y2="0" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="0" r="3" fill="currentColor" />
            {/* Lever */}
            <line
              x1="-10" y1="0"
              x2={closed ? '10' : '5'} y2={closed ? '0' : '-12'}
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            />
            {/* Label */}
            <text x="0" y="18" textAnchor="middle" fontSize="9" fill="currentColor">
              {closed ? 'ON' : 'OFF'}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 30 },
  },
  board: {
    symbol: {
      width: 50,
      height: 40,
      render: (params) => {
        const closed = (params.closed as number) >= 1;
        return (
          <g>
            {/* Switch body */}
            <rect x="-18" y="-12" width="36" height="24" rx="4" fill="#333" stroke="#555" strokeWidth="1" />
            {/* Toggle lever */}
            <rect
              x={closed ? '2' : '-14'} y="-8" width="12" height="16" rx="2"
              fill={closed ? '#4a9' : '#666'} stroke="#444" strokeWidth="0.5"
            />
            {/* Terminal leads */}
            <rect x="-25" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            <rect x="17" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
            {/* Label */}
            <text x="0" y="24" textAnchor="middle" fontSize="8" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
              {closed ? 'ON' : 'OFF'}
            </text>
          </g>
        );
      },
    },
    dimensions: { width: 50, height: 40 },
  },
  simulate: (inputs) => {
    return {
      pin_0: inputs.pin_0 || { voltage: 0, current: 0 },
      pin_1: inputs.pin_1 || { voltage: 0, current: 0 },
    };
  },
};
```

- [ ] **Step 2: Create SwitchNode (custom React Flow node with click-to-toggle)**

```tsx
// src/views/CircuitCanvas/nodes/SwitchNode.tsx
import { memo, useMemo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import type { CircuitNodeData } from '../useCircuitSync';

function pinPositionToHandleStyle(pinX: number, pinY: number, w: number, h: number): React.CSSProperties {
  return { position: 'absolute', left: `${pinX + w / 2}px`, top: `${pinY + h / 2}px`, transform: 'translate(-50%, -50%)' };
}
function getHandlePosition(pinX: number): Position {
  return pinX < 0 ? Position.Left : pinX > 0 ? Position.Right : Position.Bottom;
}

export const SwitchNode = memo(function SwitchNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, onPotChange } = data;
  const { updateComponent } = useCircuit();
  const definition = useMemo(() => ComponentRegistry.getInstance().get(component.type), [component.type]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const currentClosed = (component.parameters.closed as number) >= 1;
    const newClosed = currentClosed ? 0 : 1;
    updateComponent(component.id, { parameters: { ...component.parameters, closed: newClosed } });
    if (onPotChange) onPotChange(component.id, newClosed);
  }, [component, updateComponent, onPotChange]);

  if (!definition) return null;
  const symbol = definition[viewMode].symbol;
  const dims = definition[viewMode].dimensions;

  return (
    <div style={{ width: dims.width, height: dims.height, position: 'relative', cursor: 'pointer' }}>
      <svg width={dims.width} height={dims.height}
        viewBox={`${-dims.width / 2} ${-dims.height / 2} ${dims.width} ${dims.height}`}
        style={{ display: 'block', overflow: 'visible' }}
        onClick={handleClick}>
        {selected && <rect x={-dims.width/2-3} y={-dims.height/2-3} width={dims.width+6} height={dims.height+6} fill="none" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="4 2" rx="4" />}
        {symbol.render(component.parameters)}
      </svg>
      {component.pins.flatMap((pin) => {
        const handleStyle = { ...pinPositionToHandleStyle(pin.position.x, pin.position.y, dims.width, dims.height), width: 10, height: 10, borderRadius: '50%', background: viewMode === 'schematic' ? '#999' : '#c4a24e', border: viewMode === 'schematic' ? '2px solid #666' : '1px solid #8a7030' };
        const pos = getHandlePosition(pin.position.x);
        return [
          <Handle key={`${pin.id}-src`} id={pin.id} type="source" position={pos} isConnectable={true} style={handleStyle} />,
          <Handle key={`${pin.id}-tgt`} id={pin.id} type="target" position={pos} isConnectable={true} style={{ ...handleStyle, opacity: 0, pointerEvents: 'none' }} />,
        ];
      })}
    </div>
  );
});
```

- [ ] **Step 3: Register SwitchNode in node types**

In `src/views/CircuitCanvas/nodes/index.ts`, add:

```typescript
import { SwitchNode } from './SwitchNode';
```

Add to the `nodeTypes` object:

```typescript
switch: SwitchNode,
```

- [ ] **Step 4: Register switch definition in main.tsx**

Add import:

```typescript
import { switchDefinition } from './components/definitions/Switch';
```

Add registration:

```typescript
registry.register(switchDefinition);
```

- [ ] **Step 5: Verify it works**

Run: `npx tsc --noEmit`
Expected: No new errors

Run: `npm run dev` — verify switch appears in sidebar under "Ctrl" category, can be dragged to canvas, click toggles ON/OFF visual.

- [ ] **Step 6: Commit**

```bash
git add src/components/definitions/Switch.tsx src/views/CircuitCanvas/nodes/SwitchNode.tsx \
  src/views/CircuitCanvas/nodes/index.ts src/main.tsx
git commit -m "feat: interactive SPST switch component with click-to-toggle"
```

---

## Task 3: Rewrite WSG Example

**Files:**
- Modify: `src/examples/circuits.ts` (rewrite WSG entry)

- [ ] **Step 1: Rewrite the WSG example to match Original Recipe schematic**

Replace the entire MFOS WSG entry in `src/examples/circuits.ts` (from `name: 'MFOS Weird Sound Generator'` to the closing `},`) with:

```typescript
  {
    name: 'MFOS Weird Sound Generator',
    description: 'Original Recipe — three cross-modulated CD40106 oscillators with LM741 output',
    build: () => {
      // MFOS WSG Voice A "Original Recipe" by Ray Wilson (Aug 2007)
      // Faithful to the schematic: asymmetric cross-coupling via D1+S2+Q1,
      // passive Oddness filter, LM741 inverting amp output stage.

      const power = createComponentFromDefinition(getDefinition('power'), { x: 100, y: 50 });
      const ground = createComponentFromDefinition(getDefinition('ground'), { x: 100, y: 850 });
      const ic = createComponentFromDefinition(getDefinition('cd40106'), { x: 550, y: 350 });
      const opamp = createComponentFromDefinition(getDefinition('lm741'), { x: 950, y: 500 });
      const output = createComponentFromDefinition(getDefinition('audio-output'), { x: 1150, y: 500 });

      // --- Wacky Oscillator (U1-B: input pin 1, output pin 7) ---
      const potWacky = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 150 });
      potWacky.parameters = { ...potWacky.parameters, maxResistance: 1000000, value: '1M', position: 0.3 };
      const r6 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 150 });
      r6.parameters = { ...r6.parameters, resistance: 4700, value: '4.7k' };
      const c4 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 250 });
      c4.parameters = { ...c4.parameters, capacitance: 22e-9, value: '22nF' };

      // --- Weird Oscillator (U1-A: input pin 0, output pin 6) ---
      const potWeird = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 400 });
      potWeird.parameters = { ...potWeird.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const c5 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 500 });
      c5.parameters = { ...c5.parameters, capacitance: 22e-9, value: '22nF' };

      // --- Zany Oscillator (U1-C: input pin 2, output pin 8) ---
      const potZany = createComponentFromDefinition(getDefinition('potentiometer'), { x: 200, y: 650 });
      potZany.parameters = { ...potZany.parameters, maxResistance: 1000000, value: '1M', position: 0.7 };
      const r15 = createComponentFromDefinition(getDefinition('resistor'), { x: 350, y: 650 });
      r15.parameters = { ...r15.parameters, resistance: 4700, value: '4.7k' };
      const c7 = createComponentFromDefinition(getDefinition('capacitor'), { x: 280, y: 750 });
      c7.parameters = { ...c7.parameters, capacitance: 1e-6, value: '1uF' };

      // --- Cross-coupling: Wacky → Weird via D1 + S2 + Q1 ---
      const d1 = createComponentFromDefinition(getDefinition('1n914'), { x: 650, y: 150 });
      const s2 = createComponentFromDefinition(getDefinition('switch'), { x: 720, y: 200 });
      s2.parameters = { ...s2.parameters, closed: 1 }; // Wackiness ON by default
      const q1 = createComponentFromDefinition(getDefinition('2n3904'), { x: 650, y: 350 });
      const r7 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 280 });
      r7.parameters = { ...r7.parameters, resistance: 4700, value: '4.7k' };
      const r14 = createComponentFromDefinition(getDefinition('resistor'), { x: 650, y: 450 });
      r14.parameters = { ...r14.parameters, resistance: 4700, value: '4.7k' };

      // --- Cross-coupling: Zany → Wacky ---
      const r13 = createComponentFromDefinition(getDefinition('resistor'), { x: 450, y: 650 });
      r13.parameters = { ...r13.parameters, resistance: 1000000, value: '1M' };

      // --- Zaniness Amount ---
      const potZaniness = createComponentFromDefinition(getDefinition('potentiometer'), { x: 450, y: 750 });
      potZaniness.parameters = { ...potZaniness.parameters, maxResistance: 100000, value: '100k', position: 0.5 };
      const r19 = createComponentFromDefinition(getDefinition('resistor'), { x: 520, y: 750 });
      r19.parameters = { ...r19.parameters, resistance: 47000, value: '47k' };

      // --- Oddness Filter ---
      const r5 = createComponentFromDefinition(getDefinition('resistor'), { x: 750, y: 500 });
      r5.parameters = { ...r5.parameters, resistance: 1000000, value: '1M' };
      const potOddness = createComponentFromDefinition(getDefinition('potentiometer'), { x: 820, y: 400 });
      potOddness.parameters = { ...potOddness.parameters, maxResistance: 1000000, value: '1M', position: 0.5 };
      const c1 = createComponentFromDefinition(getDefinition('capacitor'), { x: 850, y: 500 });
      c1.parameters = { ...c1.parameters, capacitance: 100e-9, value: '100nF' };

      // --- LM741 Output Stage ---
      const r4 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 450 });
      r4.parameters = { ...r4.parameters, resistance: 10000000, value: '10M' };
      const r11 = createComponentFromDefinition(getDefinition('resistor'), { x: 950, y: 420 });
      r11.parameters = { ...r11.parameters, resistance: 750000, value: '750k' };
      const r16 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 550 });
      r16.parameters = { ...r16.parameters, resistance: 100000, value: '100k' };
      const r17 = createComponentFromDefinition(getDefinition('resistor'), { x: 900, y: 620 });
      r17.parameters = { ...r17.parameters, resistance: 100000, value: '100k' };
      const r12 = createComponentFromDefinition(getDefinition('resistor'), { x: 1050, y: 500 });
      r12.parameters = { ...r12.parameters, resistance: 1000, value: '1k' };
      const c6 = createComponentFromDefinition(getDefinition('capacitor'), { x: 1100, y: 500 });
      c6.parameters = { ...c6.parameters, capacitance: 1e-6, value: '1uF' };

      // --- Bypass cap ---
      const c9 = createComponentFromDefinition(getDefinition('capacitor'), { x: 200, y: 850 });
      c9.parameters = { ...c9.parameters, capacitance: 100e-9, value: '100nF' };

      const components = [
        power, ground, ic, opamp, output,
        potWacky, r6, c4,
        potWeird, c5,
        potZany, r15, c7,
        d1, s2, q1, r7, r14,
        r13, potZaniness, r19,
        r5, potOddness, c1,
        r4, r11, r16, r17, r12, c6,
        c9,
      ];

      // LM741 pin mapping: 0=IN-, 1=IN+, 2=V-, 3=OUT, 4=V+
      // CD40106 pin mapping: 0-5=inputs(1A-6A), 6-11=outputs(1Y-6Y), 12=VDD, 13=VSS
      // 2N3904 pin mapping: 0=Base, 1=Collector, 2=Emitter
      // 1N914 pin mapping: 0=Anode, 1=Cathode

      const connections = [
        // === Power ===
        connect(power, 0, ic, 12),       // +9V to CD40106 VDD
        connect(power, 1, ground, 0),     // Power GND
        connect(ground, 0, ic, 13),       // CD40106 VSS to GND
        connect(power, 0, opamp, 4),      // +9V to LM741 V+
        connect(ground, 0, opamp, 2),     // GND to LM741 V-

        // === Wacky Oscillator (U1-B: input=pin1, output=pin7) ===
        connect(potWacky, 0, ic, 1),      // Pot terminal to input
        connect(potWacky, 2, ic, 7),      // Pot terminal to output
        connect(r6, 0, ic, 1),            // R6 to input (min R, parallel with pot)
        connect(r6, 1, ic, 7),            // R6 to output
        connect(c4, 0, ic, 1),            // C4 to input
        connect(c4, 1, ground, 0),        // C4 to GND

        // === Weird Oscillator (U1-A: input=pin0, output=pin6) ===
        connect(potWeird, 0, ic, 0),      // Pot terminal to input
        connect(potWeird, 2, ic, 6),      // Pot terminal to output
        connect(c5, 0, ic, 0),            // C5 to input
        connect(c5, 1, ground, 0),        // C5 to GND

        // === Zany Oscillator (U1-C: input=pin2, output=pin8) ===
        connect(potZany, 0, ic, 2),       // Pot terminal to input
        connect(potZany, 2, ic, 8),       // Pot terminal to output
        connect(r15, 0, ic, 2),           // R15 to input (min R)
        connect(r15, 1, ic, 8),           // R15 to output
        connect(c7, 0, ic, 2),            // C7 to input
        connect(c7, 1, ground, 0),        // C7 to GND

        // === Cross-coupling: Wacky → Weird (D1 + S2 + Q1) ===
        connect(ic, 7, d1, 0),            // Wacky output → D1 anode
        connect(d1, 1, s2, 0),            // D1 cathode → S2 switch pin 1
        connect(s2, 1, q1, 0),            // S2 pin 2 → Q1 base
        connect(q1, 1, r7, 0),            // Q1 collector → R7
        connect(r7, 1, ic, 6),            // R7 → Weird output (pin 6)
        connect(q1, 2, r14, 0),           // Q1 emitter → R14
        connect(r14, 1, ic, 0),           // R14 → Weird input (pin 0)

        // === Cross-coupling: Zany → Wacky ===
        connect(ic, 8, potZaniness, 0),   // Zany output → Zaniness pot
        connect(potZaniness, 1, r19, 0),  // Zaniness wiper → R19
        connect(r19, 1, r13, 0),          // R19 → R13
        connect(r13, 1, ic, 1),           // R13 → Wacky input

        // === Oddness Filter ===
        connect(ic, 6, r5, 0),            // Weird output → R5 (filter input)
        connect(r5, 1, potOddness, 0),    // R5 → COF1 / Oddness pot
        connect(potOddness, 1, ground, 0),// Oddness wiper → GND (variable shunt)
        connect(r5, 1, c1, 0),            // COF1 → C1
        connect(c1, 1, r4, 0),            // C1 → COF2 → R4 (op-amp input)

        // === LM741 Output Stage ===
        connect(r4, 1, opamp, 0),         // R4 → IN- (inverting input)
        connect(opamp, 3, r11, 0),        // OUT → R11 (feedback)
        connect(r11, 1, opamp, 0),        // R11 → IN- (feedback to inverting)
        connect(power, 0, r16, 0),        // +9V → R16
        connect(r16, 1, opamp, 1),        // R16 → IN+ (bias)
        connect(opamp, 1, r17, 0),        // IN+ → R17
        connect(r17, 1, ground, 0),       // R17 → GND (bias divider = 4.5V)
        connect(opamp, 3, r12, 0),        // OUT → R12 (output resistor)
        connect(r12, 1, c6, 0),           // R12 → C6 (coupling cap)
        connect(c6, 1, output, 0),        // C6 → audio output

        // === Bypass ===
        connect(power, 0, c9, 0),         // +9V → C9
        connect(c9, 1, ground, 0),        // C9 → GND
      ];

      return { components, connections };
    },
  },
```

- [ ] **Step 2: Verify type checking**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Verify dev server loads WSG example**

Run: `npm run dev` — load WSG from Examples menu, press play, verify audio output. Toggle S2 switch to hear the difference (with/without Wacky→Weird cross-modulation).

- [ ] **Step 4: Commit**

```bash
git add src/examples/circuits.ts
git commit -m "feat: WSG example rewritten to match MFOS Original Recipe schematic"
```

---

## Self-Review

**Spec coverage:**
- [x] SwitchModel simulation — Task 1
- [x] Switch component definition — Task 2
- [x] SwitchNode interactive UI — Task 2
- [x] Register in nodeTypes — Task 2
- [x] Register in worklet — Task 1
- [x] Register in main.tsx — Task 2
- [x] WSG rewrite with all schematic components — Task 3
- [x] Wacky oscillator (R1+R6+C4) — Task 3
- [x] Weird oscillator (pot+C5) — Task 3
- [x] Zany oscillator (R13_pot+R15+C7) — Task 3
- [x] Cross-coupling Wacky→Weird via D1+S2+Q1+R7+R14 — Task 3
- [x] Cross-coupling Zany→Wacky via R18+R19+R13 — Task 3
- [x] Oddness filter (R5+R3+C1) — Task 3
- [x] LM741 output (R4+R11+R16+R17+R12+C6) — Task 3
- [x] Bypass cap — Task 3
- [x] SwitchModel test — Task 1

**Type consistency:** SwitchModel uses `ComponentModel` interface. Switch definition uses `ComponentDefinition`. SwitchNode follows PotentiometerNode pattern. Pin IDs use `generatePinId`. All consistent.

**No placeholders:** All code is complete. All file paths are exact.
