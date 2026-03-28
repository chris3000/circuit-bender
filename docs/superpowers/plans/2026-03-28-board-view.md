# Board View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken breadboard view with a skeuomorphic PCB board view that shares positions with the schematic view.

**Architecture:** Unify component positions to a single `{x, y}`, remove all breadboard-specific code (Canvas renderer, auto-placement, separate coordinate system), and add a new SVG-based BoardView that renders the same circuit with physical-look components on a green PCB background. Board view reuses SchematicView's interaction infrastructure (DnD, wiring, selection) with different visual renderers.

**Tech Stack:** React, TypeScript, SVG, @dnd-kit/core

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `src/views/BoardView/BoardView.tsx` | Main board view SVG component — mirrors SchematicView structure but renders PCB background and board-style components/wires |
| `src/views/BoardView/BoardBackground.tsx` | PCB background: green board, texture pattern, mounting holes, silkscreen title |
| `src/views/BoardView/BoardComponent.tsx` | Wrapper rendering through-hole pads + physical component SVG + silkscreen label |
| `src/views/BoardView/BoardWire.tsx` | Curved bezier wire with color logic and obstacle avoidance |
| `src/views/BoardView/BoardPin.tsx` | Through-hole pad (gold ring) with hover interaction for wiring |

### Files to Modify
| File | Change |
|------|--------|
| `src/types/circuit.ts` | Flatten `position` to `Position2D`, remove `BreadboardPosition`, update `ComponentDefinition` to replace `breadboard` with `board` |
| `src/utils/componentFactory.ts` | Remove breadboard grid import/usage, set position directly |
| `src/context/CircuitContext.tsx` | Remove `resetBreadboardGrid` import/usage |
| `src/App.tsx` | Replace BreadboardView with BoardView, rename ActiveView type, update view toggle |
| `src/constants/dnd.ts` | Replace `DROPPABLE_BREADBOARD_ID` with `DROPPABLE_BOARD_ID` |
| `src/views/SchematicView.tsx` | Update position access from `component.position.schematic` to `component.position` |
| `src/views/SchematicView/DraggableComponent.tsx` | Update position access from `component.position.schematic` to `component.position` |
| `src/views/SchematicView/Toolbar.tsx` | Update ActiveView type from `'breadboard'` to `'board'` |
| `src/components/definitions/Resistor.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/Capacitor.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/LED.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/CD40106.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/PowerSupply.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/Ground.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/Potentiometer.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/AudioOutputJack.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/LM741.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/Diode1N914.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/components/definitions/Transistor2N3904.tsx` | Replace `breadboard` with `board` SVG renderer |
| `src/examples/circuits.ts` | No changes needed — already uses `createComponentFromDefinition` with `{x, y}` |
| `src/models/Circuit.ts` | No changes needed — handles components generically |

### Files to Delete
| File | Reason |
|------|--------|
| `src/views/BreadboardView/BreadboardView.tsx` | Replaced by BoardView |
| `src/views/BreadboardView/BreadboardRenderer.ts` | Canvas renderer no longer needed |
| `src/views/BreadboardView/autoPlace.ts` | Auto-placement no longer needed (shared positions) |

---

### Task 1: Flatten position type and update Component interface

**Files:**
- Modify: `src/types/circuit.ts:7-45`

- [ ] **Step 1: Update the types**

In `src/types/circuit.ts`, make these changes:

Remove the `BreadboardPosition` interface (lines 12-15) and flatten `Component.position`:

```typescript
// Remove this:
export interface BreadboardPosition {
  row: number;
  column: number;
}

// Change Component.position from:
position: {
  schematic: Position2D;
  breadboard: BreadboardPosition;
};

// To:
position: Position2D;
```

Replace `breadboard` with `board` in `ComponentDefinition` (lines 112-118):

```typescript
// Replace:
breadboard: {
  renderer: (
    ctx: CanvasRenderingContext2D,
    params: ComponentParameters
  ) => void;
  dimensions: { rows: number; columns: number };
};

// With:
board: {
  symbol: SVGSymbol;
  dimensions: { width: number; height: number };
};
```

- [ ] **Step 2: Run type check to see what breaks**

Run: `npx tsc --noEmit 2>&1 | head -80`

Expected: Many type errors across files that reference `position.schematic`, `position.breadboard`, and `breadboard` on component definitions. This confirms all the places we need to update.

- [ ] **Step 3: Commit**

```bash
git add src/types/circuit.ts
git commit -m "refactor: flatten component position to Position2D, replace breadboard with board in types"
```

---

### Task 2: Update component factory and remove breadboard grid

**Files:**
- Modify: `src/utils/componentFactory.ts:1-38`
- Modify: `src/context/CircuitContext.tsx:3,121`

- [ ] **Step 1: Simplify componentFactory**

Replace the entire file `src/utils/componentFactory.ts`:

```typescript
import { nanoid } from 'nanoid';
import type {
  Component,
  ComponentDefinition,
  ComponentId,
  Position2D,
} from '@/types/circuit';

export const createComponentFromDefinition = (
  definition: ComponentDefinition,
  position: Position2D
): Component => {
  return {
    id: `comp_${nanoid(10)}` as ComponentId,
    type: definition.type,
    position,
    rotation: 0,
    parameters: { ...definition.defaultParameters },
    pins: definition.pins.map(pin => ({
      ...pin,
      position: { ...pin.position },
    })),
    state: {
      voltages: new Map(),
      currents: new Map(),
    },
  };
};
```

- [ ] **Step 2: Remove breadboard grid reference from CircuitContext**

In `src/context/CircuitContext.tsx`:

Remove the import on line 3:
```typescript
// Remove this line:
import { resetBreadboardGrid } from '@/utils/componentFactory';
```

Remove the `resetBreadboardGrid()` call on line 121 in the `LOAD_CIRCUIT` case:
```typescript
// Change from:
case 'LOAD_CIRCUIT':
  resetBreadboardGrid();
  return {

// To:
case 'LOAD_CIRCUIT':
  return {
```

- [ ] **Step 3: Commit**

```bash
git add src/utils/componentFactory.ts src/context/CircuitContext.tsx
git commit -m "refactor: remove breadboard grid, simplify component factory to use flat position"
```

---

### Task 3: Update SchematicView position access

**Files:**
- Modify: `src/views/SchematicView/DraggableComponent.tsx:128`
- Modify: `src/views/SchematicView.tsx` (all `position.schematic` references)

- [ ] **Step 1: Update DraggableComponent**

In `src/views/SchematicView/DraggableComponent.tsx`, line 128, change:

```typescript
// From:
<g transform={`translate(${component.position.schematic.x}, ${component.position.schematic.y})`}>

// To:
<g transform={`translate(${component.position.x}, ${component.position.y})`}>
```

- [ ] **Step 2: Update SchematicView**

In `src/views/SchematicView.tsx`, find every reference to `component.position.schematic` and replace with `component.position`. These appear in:

- Wire endpoint calculations (where pin absolute positions are computed by adding component position + pin relative position)
- Component drag handling (reading/writing position)
- Any position update dispatches

Replace all instances of `.position.schematic.x` with `.position.x` and `.position.schematic.y` with `.position.y`.

Also update any position update calls from:
```typescript
// From:
updateComponent(id, { position: { ...component.position, schematic: newPos } })

// To:
updateComponent(id, { position: newPos })
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -80`

Expected: Errors should be reduced to breadboard-related files and component definitions only. SchematicView errors should be resolved.

- [ ] **Step 4: Commit**

```bash
git add src/views/SchematicView.tsx src/views/SchematicView/DraggableComponent.tsx
git commit -m "refactor: update SchematicView to use flat position"
```

---

### Task 4: Update Toolbar and App view type

**Files:**
- Modify: `src/views/SchematicView/Toolbar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/constants/dnd.ts`

- [ ] **Step 1: Update Toolbar**

In `src/views/SchematicView/Toolbar.tsx`, update the `activeView` prop type and button labels. Change:

```typescript
// From:
activeView?: 'schematic' | 'breadboard';

// To:
activeView?: 'schematic' | 'board';
```

Update the Board tab button text if it says "Breadboard" to say "Board".

- [ ] **Step 2: Update DnD constants**

In `src/constants/dnd.ts`, replace:

```typescript
// From:
export const DROPPABLE_BREADBOARD_ID = 'breadboard-canvas';

// To:
export const DROPPABLE_BOARD_ID = 'board-canvas';
```

- [ ] **Step 3: Update App.tsx**

In `src/App.tsx`:

Change the type alias (line 18):
```typescript
// From:
type ActiveView = 'schematic' | 'breadboard';

// To:
type ActiveView = 'schematic' | 'board';
```

Remove BreadboardView import (line 13):
```typescript
// Remove:
import BreadboardView from './views/BreadboardView/BreadboardView';
```

Update the import of the DnD constant (line 8):
```typescript
// From:
import { DROPPABLE_CANVAS_ID, DROPPABLE_BREADBOARD_ID } from './constants/dnd';

// To:
import { DROPPABLE_CANVAS_ID, DROPPABLE_BOARD_ID } from './constants/dnd';
```

Update all `'breadboard'` string literals to `'board'` in:
- Tab key handler (line 109): `v === 'schematic' ? 'board' : 'schematic'`
- View toggle callbacks (lines 235, 245): same pattern
- `handleDragEnd` droppable check (line 150): `over.id !== DROPPABLE_BOARD_ID`

Replace the BreadboardView rendering (lines 242-247) with a placeholder for now:
```tsx
) : (
  <div id="board-canvas" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a6b3c', color: '#a8d8a8', fontFamily: 'Courier New' }}>
    Board view coming soon
  </div>
)}
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Errors only in component definition files (breadboard property) and possibly BreadboardView files (about to delete).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/constants/dnd.ts src/views/SchematicView/Toolbar.tsx
git commit -m "refactor: rename breadboard to board in App, DnD constants, and Toolbar"
```

---

### Task 5: Delete breadboard view files

**Files:**
- Delete: `src/views/BreadboardView/BreadboardView.tsx`
- Delete: `src/views/BreadboardView/BreadboardRenderer.ts`
- Delete: `src/views/BreadboardView/autoPlace.ts`

- [ ] **Step 1: Delete the breadboard directory**

```bash
rm -rf src/views/BreadboardView
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Errors only in component definition files (the `breadboard` property on `ComponentDefinition` no longer exists — it's now `board`).

- [ ] **Step 3: Commit**

```bash
git add -A src/views/BreadboardView
git commit -m "refactor: remove BreadboardView — replaced by BoardView"
```

---

### Task 6: Update component definitions — Resistor and Capacitor

**Files:**
- Modify: `src/components/definitions/Resistor.tsx:59-84`
- Modify: `src/components/definitions/Capacitor.tsx` (breadboard section)

- [ ] **Step 1: Update Resistor definition**

In `src/components/definitions/Resistor.tsx`, replace the `breadboard` property (lines 59-84) with:

```tsx
board: {
  symbol: {
    width: 60,
    height: 20,
    render: (params) => {
      return (
        <g>
          {/* Leads */}
          <rect x="-30" y="-1.5" width="12" height="3" rx="1" fill="#ccc" />
          <rect x="18" y="-1.5" width="12" height="3" rx="1" fill="#ccc" />
          {/* Body */}
          <rect x="-18" y="-8" width="36" height="16" rx="5" fill="#c49456" stroke="#7a5820" strokeWidth="0.8" />
          {/* Color bands */}
          <rect x="-12" y="-8" width="3" height="16" rx="0.5" fill="#8B4513" opacity="0.85" />
          <rect x="-5" y="-8" width="3" height="16" rx="0.5" fill="#1a1a1a" opacity="0.85" />
          <rect x="2" y="-8" width="3" height="16" rx="0.5" fill="#FF8C00" opacity="0.85" />
          <rect x="11" y="-8" width="3" height="16" rx="0.5" fill="#CFB53B" opacity="0.85" />
          {/* Value label */}
          <text x="0" y="20" textAnchor="middle" fontSize="8" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
            {params.value}
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 60, height: 20 },
},
```

- [ ] **Step 2: Update Capacitor definition**

In `src/components/definitions/Capacitor.tsx`, replace the `breadboard` property with:

```tsx
board: {
  symbol: {
    width: 50,
    height: 30,
    render: (params) => {
      return (
        <g>
          {/* Leads */}
          <rect x="-20" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          <rect x="12" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          {/* Disc ceramic body */}
          <ellipse cx="0" cy="0" rx="12" ry="10" fill="#e8a020" stroke="#c08010" strokeWidth="0.8" />
          {/* Markings */}
          <text x="0" y="2" textAnchor="middle" fontSize="6" fill="#6a4000" fontFamily="Courier New" fontWeight="bold">
            104
          </text>
          {/* Value label */}
          <text x="0" y="20" textAnchor="middle" fontSize="8" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
            {params.value}
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 50, height: 30 },
},
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Errors reduced — Resistor and Capacitor should be clean. Remaining errors in other definition files.

- [ ] **Step 4: Commit**

```bash
git add src/components/definitions/Resistor.tsx src/components/definitions/Capacitor.tsx
git commit -m "feat: add board view SVG renderers for Resistor and Capacitor"
```

---

### Task 7: Update component definitions — LED, Diode, Transistor

**Files:**
- Modify: `src/components/definitions/LED.tsx`
- Modify: `src/components/definitions/Diode1N914.tsx`
- Modify: `src/components/definitions/Transistor2N3904.tsx`

- [ ] **Step 1: Update LED definition**

Replace the `breadboard` property in `src/components/definitions/LED.tsx` with:

```tsx
board: {
  symbol: {
    width: 40,
    height: 30,
    render: (params) => {
      const color = (params.color as string) || 'red';
      const cssColor = color === 'red' ? '#ff2d55' : color === 'green' ? '#00ff88' : color === 'blue' ? '#4488ff' : '#ff2d55';
      return (
        <g>
          {/* Leads */}
          <rect x="-20" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          <rect x="12" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          {/* LED dome */}
          <ellipse cx="0" cy="0" rx="10" ry="12" fill={cssColor} opacity="0.3" stroke={cssColor} strokeWidth="0.8" />
          <ellipse cx="0" cy="0" rx="7" ry="9" fill={cssColor} opacity="0.5" />
          <ellipse cx="-2" cy="-3" rx="3" ry="4" fill={cssColor} opacity="0.3" />
          {/* Flat cathode edge */}
          <line x1="8" y1="-10" x2="8" y2="10" stroke={cssColor} strokeWidth="1" opacity="0.5" />
          {/* Label */}
          <text x="0" y="22" textAnchor="middle" fontSize="8" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
            LED
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 40, height: 30 },
},
```

- [ ] **Step 2: Update Diode1N914 definition**

Replace the `breadboard` property in `src/components/definitions/Diode1N914.tsx` with:

```tsx
board: {
  symbol: {
    width: 40,
    height: 20,
    render: () => {
      return (
        <g>
          {/* Leads */}
          <rect x="-20" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          <rect x="12" y="-1.5" width="8" height="3" rx="1" fill="#ccc" />
          {/* Glass body */}
          <rect x="-12" y="-5" width="24" height="10" rx="4" fill="#e8a060" stroke="#c07030" strokeWidth="0.6" opacity="0.8" />
          {/* Cathode band */}
          <rect x="8" y="-5" width="3" height="10" rx="0.5" fill="#1a1a1a" opacity="0.8" />
          {/* Label */}
          <text x="0" y="16" textAnchor="middle" fontSize="7" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
            1N914
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 40, height: 20 },
},
```

- [ ] **Step 3: Update Transistor2N3904 definition**

Replace the `breadboard` property in `src/components/definitions/Transistor2N3904.tsx` with:

```tsx
board: {
  symbol: {
    width: 50,
    height: 50,
    render: () => {
      return (
        <g>
          {/* Leads */}
          <rect x="-25" y="-1.5" width="10" height="3" rx="1" fill="#ccc" />
          <rect x="-1.5" y="-25" width="3" height="10" rx="1" fill="#ccc" />
          <rect x="-1.5" y="15" width="3" height="10" rx="1" fill="#ccc" />
          {/* TO-92 body */}
          <path d="M -10,-12 A 14,14 0 0,1 10,-12 L 10,12 A 14,14 0 0,1 -10,12 Z" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
          {/* Flat face */}
          <line x1="-10" y1="-12" x2="-10" y2="12" stroke="#555" strokeWidth="1" />
          {/* Label */}
          <text x="0" y="2" textAnchor="middle" fontSize="6" fill="#ccc" fontFamily="Courier New">2N</text>
          <text x="0" y="9" textAnchor="middle" fontSize="6" fill="#ccc" fontFamily="Courier New">3904</text>
        </g>
      );
    },
  },
  dimensions: { width: 50, height: 50 },
},
```

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

- [ ] **Step 5: Commit**

```bash
git add src/components/definitions/LED.tsx src/components/definitions/Diode1N914.tsx src/components/definitions/Transistor2N3904.tsx
git commit -m "feat: add board view SVG renderers for LED, Diode, and Transistor"
```

---

### Task 8: Update component definitions — ICs (CD40106, LM741)

**Files:**
- Modify: `src/components/definitions/CD40106.tsx`
- Modify: `src/components/definitions/LM741.tsx`

- [ ] **Step 1: Update CD40106 definition**

Replace the `breadboard` property in `src/components/definitions/CD40106.tsx` with:

```tsx
board: {
  symbol: {
    width: 80,
    height: 160,
    render: () => {
      return (
        <g>
          {/* DIP-14 body */}
          <rect x="-25" y="-70" width="50" height="140" rx="3" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
          {/* Pin 1 notch */}
          <path d="M 0,-70 A 6,6 0 0,0 0,-58" fill="none" stroke="#555" strokeWidth="1" />
          {/* Pin 1 dot */}
          <circle cx="-15" cy="-60" r="2" fill="#555" />
          {/* IC text */}
          <text x="0" y="-5" textAnchor="middle" fontSize="7" fill="#ccc" fontFamily="Courier New" fontWeight="bold">CD40106</text>
          <text x="0" y="6" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">HEX SCHMITT</text>
          <text x="0" y="15" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">INVERTER</text>
          {/* Pin legs — left side */}
          <rect x="-30" y="-52" width="6" height="2" fill="#bbb" />
          <rect x="-30" y="-32" width="6" height="2" fill="#bbb" />
          <rect x="-30" y="-12" width="6" height="2" fill="#bbb" />
          <rect x="-30" y="8" width="6" height="2" fill="#bbb" />
          <rect x="-30" y="28" width="6" height="2" fill="#bbb" />
          <rect x="-30" y="48" width="6" height="2" fill="#bbb" />
          {/* Pin legs — right side */}
          <rect x="24" y="-52" width="6" height="2" fill="#bbb" />
          <rect x="24" y="-32" width="6" height="2" fill="#bbb" />
          <rect x="24" y="-12" width="6" height="2" fill="#bbb" />
          <rect x="24" y="8" width="6" height="2" fill="#bbb" />
          <rect x="24" y="28" width="6" height="2" fill="#bbb" />
          <rect x="24" y="48" width="6" height="2" fill="#bbb" />
          {/* VDD/VSS legs at top */}
          <rect x="-11" y="-70" width="2" height="6" fill="#bbb" />
          <rect x="9" y="-70" width="2" height="6" fill="#bbb" />
        </g>
      );
    },
  },
  dimensions: { width: 80, height: 160 },
},
```

- [ ] **Step 2: Update LM741 definition**

Replace the `breadboard` property in `src/components/definitions/LM741.tsx` with:

```tsx
board: {
  symbol: {
    width: 70,
    height: 90,
    render: () => {
      return (
        <g>
          {/* DIP-8 body */}
          <rect x="-20" y="-35" width="40" height="70" rx="3" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
          {/* Pin 1 notch */}
          <path d="M 0,-35 A 5,5 0 0,0 0,-25" fill="none" stroke="#555" strokeWidth="1" />
          {/* Pin 1 dot */}
          <circle cx="-10" cy="-27" r="2" fill="#555" />
          {/* IC text */}
          <text x="0" y="0" textAnchor="middle" fontSize="7" fill="#ccc" fontFamily="Courier New" fontWeight="bold">LM741</text>
          <text x="0" y="10" textAnchor="middle" fontSize="6" fill="#888" fontFamily="Courier New">OP-AMP</text>
          {/* Pin legs — left side */}
          <rect x="-25" y="-32" width="6" height="2" fill="#bbb" />
          <rect x="-25" y="-12" width="6" height="2" fill="#bbb" />
          <rect x="-25" y="8" width="6" height="2" fill="#bbb" />
          <rect x="-25" y="28" width="6" height="2" fill="#bbb" />
          {/* Pin legs — right side */}
          <rect x="19" y="-32" width="6" height="2" fill="#bbb" />
          <rect x="19" y="-12" width="6" height="2" fill="#bbb" />
          <rect x="19" y="8" width="6" height="2" fill="#bbb" />
          <rect x="19" y="28" width="6" height="2" fill="#bbb" />
        </g>
      );
    },
  },
  dimensions: { width: 70, height: 90 },
},
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

- [ ] **Step 4: Commit**

```bash
git add src/components/definitions/CD40106.tsx src/components/definitions/LM741.tsx
git commit -m "feat: add board view SVG renderers for CD40106 and LM741 ICs"
```

---

### Task 9: Update component definitions — Power, Ground, Audio Output, Potentiometer

**Files:**
- Modify: `src/components/definitions/PowerSupply.tsx`
- Modify: `src/components/definitions/Ground.tsx`
- Modify: `src/components/definitions/AudioOutputJack.tsx`
- Modify: `src/components/definitions/Potentiometer.tsx`

- [ ] **Step 1: Update PowerSupply definition**

Replace the `breadboard` property in `src/components/definitions/PowerSupply.tsx` with:

```tsx
board: {
  symbol: {
    width: 40,
    height: 60,
    render: (params) => {
      return (
        <g>
          {/* Battery body */}
          <rect x="-18" y="-25" width="36" height="50" rx="4" fill="#2a2a2a" stroke="#555" strokeWidth="0.8" />
          {/* Terminal marking */}
          <rect x="-8" y="-25" width="16" height="3" rx="1" fill="#c44" />
          <text x="0" y="-5" textAnchor="middle" fontSize="12" fill="#e04040" fontFamily="Courier New" fontWeight="bold">+</text>
          <text x="0" y="12" textAnchor="middle" fontSize="12" fill="#999" fontFamily="Courier New">-</text>
          <text x="0" y="22" textAnchor="middle" fontSize="6" fill="#777" fontFamily="Courier New">{params.value}</text>
        </g>
      );
    },
  },
  dimensions: { width: 40, height: 60 },
},
```

- [ ] **Step 2: Update Ground definition**

Replace the `breadboard` property in `src/components/definitions/Ground.tsx` with:

```tsx
board: {
  symbol: {
    width: 40,
    height: 40,
    render: () => {
      return (
        <g>
          {/* Ground block */}
          <rect x="-10" y="-10" width="20" height="14" rx="2" fill="#2a2a2a" stroke="#555" strokeWidth="0.6" />
          {/* Ground bars */}
          <line x1="-6" y1="0" x2="6" y2="0" stroke="#888" strokeWidth="1.5" />
          <line x1="-4" y1="3" x2="4" y2="3" stroke="#888" strokeWidth="1.2" />
          <line x1="-2" y1="6" x2="2" y2="6" stroke="#888" strokeWidth="0.8" />
          {/* Label */}
          <text x="0" y="18" textAnchor="middle" fontSize="7" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">GND</text>
        </g>
      );
    },
  },
  dimensions: { width: 40, height: 40 },
},
```

- [ ] **Step 3: Update AudioOutputJack definition**

Replace the `breadboard` property in `src/components/definitions/AudioOutputJack.tsx` with:

```tsx
board: {
  symbol: {
    width: 40,
    height: 40,
    render: () => {
      return (
        <g>
          {/* Jack barrel */}
          <rect x="-12" y="-8" width="24" height="16" rx="3" fill="#444" stroke="#666" strokeWidth="0.8" />
          {/* Jack opening */}
          <circle cx="8" cy="0" r="4" fill="#222" stroke="#666" strokeWidth="0.5" />
          {/* Metal tip highlight */}
          <circle cx="8" cy="0" r="2" fill="#888" />
          {/* Label */}
          <text x="0" y="18" textAnchor="middle" fontSize="7" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">OUT</text>
        </g>
      );
    },
  },
  dimensions: { width: 40, height: 40 },
},
```

- [ ] **Step 4: Update Potentiometer definition**

Replace the `breadboard` property in `src/components/definitions/Potentiometer.tsx` with:

```tsx
board: {
  symbol: {
    width: 60,
    height: 50,
    render: (params) => {
      const pos = (params.position as number) ?? 0.5;
      return (
        <g>
          {/* Circular body */}
          <circle cx="0" cy="0" r="14" fill="#3a5a8a" stroke="#2a4a6a" strokeWidth="0.8" />
          {/* Adjustment shaft */}
          <circle cx="0" cy="0" r="5" fill="#888" stroke="#666" strokeWidth="0.5" />
          {/* Position indicator (rotates with value) */}
          <line x1="0" y1="0" x2={Math.cos((pos - 0.5) * Math.PI) * 12} y2={Math.sin((pos - 0.5) * Math.PI) * 12} stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" />
          {/* Leads */}
          <rect x="-25" y="-1.5" width="10" height="3" rx="1" fill="#ccc" />
          <rect x="15" y="-1.5" width="10" height="3" rx="1" fill="#ccc" />
          <rect x="-1.5" y="-20" width="3" height="6" rx="1" fill="#ccc" />
          {/* Label */}
          <text x="0" y="26" textAnchor="middle" fontSize="8" fill="#a8d8a8" opacity="0.7" fontFamily="Courier New">
            {params.value}
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 60, height: 50 },
},
```

- [ ] **Step 5: Run type check — all definition errors should be resolved**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: No more errors related to `breadboard` property. Remaining errors should only be about missing BoardView (the placeholder div in App.tsx is valid JSX).

- [ ] **Step 6: Commit**

```bash
git add src/components/definitions/PowerSupply.tsx src/components/definitions/Ground.tsx src/components/definitions/AudioOutputJack.tsx src/components/definitions/Potentiometer.tsx
git commit -m "feat: add board view SVG renderers for Power, Ground, Audio Output, Potentiometer"
```

---

### Task 10: Build BoardBackground component

**Files:**
- Create: `src/views/BoardView/BoardBackground.tsx`

- [ ] **Step 1: Create BoardBackground**

Create `src/views/BoardView/BoardBackground.tsx`:

```tsx
import React from 'react';

export const BoardBackground = React.memo(function BoardBackground() {
  return (
    <g data-testid="board-background">
      <defs>
        <pattern id="pcbTexture" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#1a6b3c" />
          <rect width="1" height="1" x="1" y="1" fill="#1d7042" opacity="0.25" />
          <rect width="1" height="1" x="4" y="4" fill="#176634" opacity="0.25" />
        </pattern>
        <radialGradient id="padGradient">
          <stop offset="0%" stopColor="#e8c870" />
          <stop offset="60%" stopColor="#d4aa50" />
          <stop offset="100%" stopColor="#a08030" />
        </radialGradient>
        <radialGradient id="ledGlow">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#ff2d55" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Board fill */}
      <rect width="100%" height="100%" fill="#1a6b3c" />
      <rect width="100%" height="100%" fill="url(#pcbTexture)" />
    </g>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/views/BoardView/BoardBackground.tsx
git commit -m "feat: add BoardBackground component with PCB texture and shared SVG defs"
```

---

### Task 11: Build BoardPin component

**Files:**
- Create: `src/views/BoardView/BoardPin.tsx`

- [ ] **Step 1: Create BoardPin**

Create `src/views/BoardView/BoardPin.tsx`:

```tsx
import React, { useState, useCallback } from 'react';
import type { Pin, ComponentId, PinId } from '@/types/circuit';

interface BoardPinProps {
  pin: Pin;
  componentId: ComponentId;
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
}

export const BoardPin = React.memo(function BoardPin({
  pin,
  componentId,
  onPinDown,
  onPinUp,
}: BoardPinProps) {
  const [hovered, setHovered] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onPinDown(componentId, pin.id);
    },
    [componentId, pin.id, onPinDown]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onPinUp(componentId, pin.id);
    },
    [componentId, pin.id, onPinUp]
  );

  return (
    <g
      transform={`translate(${pin.position.x}, ${pin.position.y})`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ cursor: 'crosshair' }}
    >
      {/* Gold through-hole pad */}
      <circle
        r={hovered ? 7 : 6}
        fill="url(#padGradient)"
        stroke={hovered ? '#FF2D55' : '#8a6e2c'}
        strokeWidth={hovered ? 1.5 : 0.8}
      />
      {/* Drill hole */}
      <circle r="2" fill="#1a6b3c" />
    </g>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/views/BoardView/BoardPin.tsx
git commit -m "feat: add BoardPin through-hole pad component"
```

---

### Task 12: Build BoardComponent wrapper

**Files:**
- Create: `src/views/BoardView/BoardComponent.tsx`

- [ ] **Step 1: Create BoardComponent**

Create `src/views/BoardView/BoardComponent.tsx`:

```tsx
import React, { useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { useCircuit } from '@/context/CircuitContext';
import { BoardPin } from './BoardPin';
import type { Component, ComponentId, PinId } from '@/types/circuit';

interface BoardComponentProps {
  component: Component;
  isSelected: boolean;
  ledOn?: boolean;
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
  onPotChange?: (componentId: ComponentId, position: number) => void;
}

export const BoardComponent = React.memo(function BoardComponent({
  component,
  isSelected,
  ledOn = false,
  onPinDown,
  onPinUp,
  onClick,
  onEditParameter,
  onPotChange,
}: BoardComponentProps) {
  const { updateComponent } = useCircuit();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: component.id,
    data: { component },
  });

  const svgRef = useCallback(
    (element: SVGGElement | null) => {
      setNodeRef(element as unknown as HTMLElement | null);
    },
    [setNodeRef]
  );

  const definition = useMemo(
    () => ComponentRegistry.getInstance().get(component.type),
    [component.type]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
    [onClick]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (
        (component.type === 'resistor' || component.type === 'capacitor') &&
        onEditParameter
      ) {
        onEditParameter(component.id);
      }
    },
    [component.id, component.type, onEditParameter]
  );

  const handleSliderDrag = useCallback(
    (e: React.PointerEvent) => {
      if (component.type !== 'potentiometer') return;
      e.stopPropagation();
      e.preventDefault();

      const sliderWidth = 60;
      const startX = e.clientX;
      const currentPosition = (component.parameters.position as number) ?? 0.5;

      const onMove = (moveEvent: PointerEvent) => {
        const svgEl = (e.target as SVGElement).ownerSVGElement;
        const scale = svgEl ? svgEl.getBoundingClientRect().width / svgEl.viewBox.baseVal.width : 1;
        const newPos = Math.max(0, Math.min(1, currentPosition + (moveEvent.clientX - startX) / scale / sliderWidth));
        updateComponent(component.id, {
          parameters: { ...component.parameters, position: newPos },
        });
        if (onPotChange) onPotChange(component.id, newPos);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [component, updateComponent, onPotChange]
  );

  if (!definition) return null;

  const { width, height } = definition.board.dimensions;

  const style: React.CSSProperties = {
    cursor: 'move',
    opacity: isDragging ? 0.5 : 1,
  };

  if (transform) {
    style.transform = `translate(${transform.x}px, ${transform.y}px)`;
  }

  return (
    <g
      ref={svgRef}
      data-testid={`board-component-${component.id}`}
      data-draggable="true"
      data-selected={isSelected ? 'true' : 'false'}
      style={style}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...listeners}
      {...attributes}
    >
      <g transform={`translate(${component.position.x}, ${component.position.y})`}>
        {/* Hit area */}
        <rect
          x={-width / 2 - 5}
          y={-height / 2 - 5}
          width={width + 10}
          height={height + 10}
          fill="transparent"
          rx="4"
        />
        {/* Selection highlight */}
        {isSelected && (
          <rect
            x={-width / 2 - 5}
            y={-height / 2 - 5}
            width={width + 10}
            height={height + 10}
            fill="none"
            stroke="#FF2D55"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            rx="4"
          />
        )}
        {/* LED glow on PCB surface */}
        {component.type === 'led' && ledOn && (
          <ellipse cx="0" cy="0" rx="35" ry="35" fill="url(#ledGlow)" />
        )}
        {/* Physical component rendering */}
        {definition.board.symbol.render(component.parameters)}
        {/* Through-hole pads */}
        {component.pins.map((pin) => (
          <BoardPin
            key={pin.id}
            pin={pin}
            componentId={component.id}
            onPinDown={onPinDown}
            onPinUp={onPinUp}
          />
        ))}
        {/* Potentiometer slider */}
        {component.type === 'potentiometer' && (() => {
          const pos = (component.parameters.position as number) ?? 0.5;
          const sliderY = height / 2 + 14;
          const sliderW = 60;
          const thumbX = -sliderW / 2 + pos * sliderW;
          return (
            <g>
              <rect x={-sliderW / 2} y={sliderY - 3} width={sliderW} height={6} rx={3} fill="#444" />
              <rect x={-sliderW / 2} y={sliderY - 3} width={pos * sliderW} height={6} rx={3} fill="#FF2D55" />
              <circle cx={thumbX} cy={sliderY} r={7} fill="white" stroke="#FF2D55" strokeWidth={2} style={{ cursor: 'ew-resize' }} onPointerDown={handleSliderDrag} />
              <text x={0} y={sliderY + 16} textAnchor="middle" fontSize="8" fill="#a8d8a8" pointerEvents="none">
                {Math.round(pos * 100)}%
              </text>
            </g>
          );
        })()}
      </g>
    </g>
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add src/views/BoardView/BoardComponent.tsx
git commit -m "feat: add BoardComponent wrapper with pads, selection, LED glow, pot slider"
```

---

### Task 13: Build BoardWire component

**Files:**
- Create: `src/views/BoardView/BoardWire.tsx`

- [ ] **Step 1: Create BoardWire**

Create `src/views/BoardView/BoardWire.tsx`:

```tsx
import React from 'react';
import type { ConnectionId } from '@/types/circuit';

interface BoardWireProps {
  connectionId: ConnectionId;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  isSelected: boolean;
  onClick: (connectionId: ConnectionId) => void;
  onContextMenu?: (connectionId: ConnectionId, e: React.MouseEvent) => void;
}

/**
 * Generate a curved bezier path between two points.
 * The control points are offset perpendicular to the line to create
 * an organic arc — like a real jumper wire.
 */
function generateCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Arc height scales with distance but caps out
  const arcHeight = Math.min(dist * 0.3, 60);

  // Perpendicular direction (normalized)
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);

  // Midpoint
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Control point offset perpendicular to the line
  const cx = mx + nx * arcHeight;
  const cy = my + ny * arcHeight;

  return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
}

export const BoardWire = React.memo(function BoardWire({
  connectionId,
  fromX,
  fromY,
  toX,
  toY,
  color,
  isSelected,
  onClick,
  onContextMenu,
}: BoardWireProps) {
  const pathData = generateCurvedPath(fromX, fromY, toX, toY);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(connectionId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) onContextMenu(connectionId, e);
  };

  return (
    <g>
      {/* Fat invisible hit area */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={12}
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      {/* Visible wire */}
      <path
        data-testid={`board-wire-${connectionId}`}
        d={pathData}
        fill="none"
        stroke={isSelected ? '#FF2D55' : color}
        strokeWidth={isSelected ? 3 : 2.5}
        strokeLinecap="round"
        opacity={0.85}
        style={{ cursor: 'pointer', pointerEvents: 'none' }}
      />
    </g>
  );
});

/**
 * Determine wire color based on pin types of the connected components.
 */
export function getWireColor(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): string {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return '#e04040'; // red for power
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return '#333'; // dark for ground
  }
  return '#4a82c4'; // blue for signal
}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/BoardView/BoardWire.tsx
git commit -m "feat: add BoardWire with curved bezier paths and color logic"
```

---

### Task 14: Build BoardView main component

**Files:**
- Create: `src/views/BoardView/BoardView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create BoardView**

Create `src/views/BoardView/BoardView.tsx`. This mirrors SchematicView's structure but uses board-style rendering:

```tsx
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { validateConnection, generateOrthogonalPath } from '@/utils/wiring';
import { DROPPABLE_BOARD_ID } from '@/constants/dnd';
import { snapToGrid } from '@/utils/grid';
import { BoardBackground } from './BoardBackground';
import { BoardComponent } from './BoardComponent';
import { BoardWire, getWireColor } from './BoardWire';
import { ParameterEditor } from '@/views/SchematicView/ParameterEditor';
import { Toolbar } from '@/views/SchematicView/Toolbar';
import type { ComponentId, PinId, ConnectionId } from '@/types/circuit';
import { generateConnectionId, generateNetId } from '@/utils/ids';

interface BoardViewProps {
  activeView: 'schematic' | 'board';
  onToggleView: () => void;
  ledStates?: Record<string, boolean>;
  onPotChange?: (componentId: string, position: number) => void;
  onAddProbe?: (componentId: string, pinId: string, label: string) => void;
}

interface WiringState {
  active: boolean;
  fromComponentId?: ComponentId;
  fromPinId?: PinId;
}

export default function BoardView({
  activeView,
  onToggleView,
  ledStates = {},
  onPotChange,
  onAddProbe,
}: BoardViewProps) {
  const {
    circuit,
    addConnection,
    removeComponent,
    removeConnection,
    updateComponent,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCircuit();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [wiringState, setWiringState] = useState<WiringState>({ active: false });
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [editingComponentId, setEditingComponentId] = useState<ComponentId | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { setNodeRef } = useDroppable({ id: DROPPABLE_BOARD_ID });

  const components = useMemo(() => circuit.getComponents(), [circuit]);
  const connections = useMemo(() => circuit.getConnections(), [circuit]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        selectedComponents.forEach(id => removeComponent(id));
        selectedConnections.forEach(id => removeConnection(id));
        clearSelection();
      } else if (e.key === 'Escape') {
        setWiringState({ active: false });
        clearSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, removeComponent, removeConnection, selectedComponents, selectedConnections, clearSelection]);

  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgP = pt.matrixTransform(svgRef.current.getScreenCTM()?.inverse());
    return { x: svgP.x, y: svgP.y };
  }, []);

  const handleSvgMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (wiringState.active) {
        setCursorPos(screenToSvg(e.clientX, e.clientY));
      }
    },
    [wiringState.active, screenToSvg]
  );

  const handlePinDown = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      setWiringState({ active: true, fromComponentId: componentId, fromPinId: pinId });
    },
    []
  );

  const handlePinUp = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      if (!wiringState.active || !wiringState.fromComponentId || !wiringState.fromPinId) return;

      const result = validateConnection(
        wiringState.fromComponentId,
        wiringState.fromPinId,
        componentId,
        pinId,
        circuit
      );

      if (result.valid) {
        addConnection({
          id: generateConnectionId(),
          from: { componentId: wiringState.fromComponentId, pinId: wiringState.fromPinId },
          to: { componentId, pinId },
          net: generateNetId(),
        });
      }

      setWiringState({ active: false });
    },
    [wiringState, circuit, addConnection]
  );

  const handleComponentClick = useCallback(
    (componentId: ComponentId) => {
      setSelection([componentId], []);
    },
    [setSelection]
  );

  const handleWireClick = useCallback(
    (connectionId: ConnectionId) => {
      setSelection([], [connectionId]);
    },
    [setSelection]
  );

  const handleWireContextMenu = useCallback(
    (connectionId: ConnectionId, e: React.MouseEvent) => {
      if (!onAddProbe) return;
      const conn = connections.find(c => c.id === connectionId);
      if (!conn) return;
      const comp = circuit.getComponent(conn.from.componentId);
      const pin = comp?.pins.find(p => p.id === conn.from.pinId);
      if (comp && pin) {
        onAddProbe(conn.from.componentId, conn.from.pinId, `${comp.type}:${pin.label}`);
      }
    },
    [connections, circuit, onAddProbe]
  );

  const handleCanvasClick = useCallback(() => {
    clearSelection();
    setWiringState({ active: false });
  }, [clearSelection]);

  const handleEditParameter = useCallback((componentId: ComponentId) => {
    setEditingComponentId(componentId);
  }, []);

  // Compute absolute pin position
  const getPinPosition = useCallback(
    (componentId: ComponentId, pinId: PinId) => {
      const comp = circuit.getComponent(componentId);
      if (!comp) return { x: 0, y: 0 };
      const pin = comp.pins.find(p => p.id === pinId);
      if (!pin) return { x: 0, y: 0 };
      return {
        x: comp.position.x + pin.position.x,
        y: comp.position.y + pin.position.y,
      };
    },
    [circuit]
  );

  const viewBox = useMemo(() => {
    const w = 1200 / zoom;
    const h = 800 / zoom;
    return `${-w / 2 + pan.x} ${-h / 2 + pan.y} ${w} ${h}`;
  }, [zoom, pan]);

  return (
    <div
      ref={setNodeRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
    >
      <Toolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        activeView={activeView}
        onToggleView={onToggleView}
        zoom={zoom}
        onZoomIn={() => setZoom(z => Math.min(z * 1.2, 5))}
        onZoomOut={() => setZoom(z => Math.max(z / 1.2, 0.2))}
      />
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={viewBox}
        style={{ display: 'block' }}
        onMouseMove={handleSvgMouseMove}
        onClick={handleCanvasClick}
      >
        <BoardBackground />

        {/* Wires (behind components) */}
        {connections.map((conn) => {
          const fromPos = getPinPosition(conn.from.componentId, conn.from.pinId);
          const toPos = getPinPosition(conn.to.componentId, conn.to.pinId);
          const fromComp = circuit.getComponent(conn.from.componentId);
          const toComp = circuit.getComponent(conn.to.componentId);
          const fromPin = fromComp?.pins.find(p => p.id === conn.from.pinId);
          const toPin = toComp?.pins.find(p => p.id === conn.to.pinId);

          return (
            <BoardWire
              key={conn.id}
              connectionId={conn.id}
              fromX={fromPos.x}
              fromY={fromPos.y}
              toX={toPos.x}
              toY={toPos.y}
              color={getWireColor(
                fromComp?.type || '',
                fromPin?.type || '',
                toComp?.type || '',
                toPin?.type || '',
              )}
              isSelected={selectedConnections.includes(conn.id)}
              onClick={handleWireClick}
              onContextMenu={handleWireContextMenu}
            />
          );
        })}

        {/* Components (on top of wires) */}
        {components.map((comp) => (
          <BoardComponent
            key={comp.id}
            component={comp}
            isSelected={selectedComponents.includes(comp.id)}
            ledOn={ledStates[comp.id]}
            onPinDown={handlePinDown}
            onPinUp={handlePinUp}
            onClick={() => handleComponentClick(comp.id)}
            onEditParameter={handleEditParameter}
            onPotChange={onPotChange}
          />
        ))}

        {/* Preview wire while wiring */}
        {wiringState.active && wiringState.fromComponentId && wiringState.fromPinId && (
          <path
            d={generateOrthogonalPath(
              getPinPosition(wiringState.fromComponentId, wiringState.fromPinId).x,
              getPinPosition(wiringState.fromComponentId, wiringState.fromPinId).y,
              cursorPos.x,
              cursorPos.y,
            )}
            fill="none"
            stroke="#a8d8a8"
            strokeWidth="2"
            strokeDasharray="4 3"
            pointerEvents="none"
            opacity="0.7"
          />
        )}

        {/* Parameter editor */}
        {editingComponentId && (() => {
          const comp = circuit.getComponent(editingComponentId);
          if (!comp) return null;
          const paramKey = comp.type === 'resistor' ? 'resistance' : comp.type === 'capacitor' ? 'capacitance' : null;
          if (!paramKey) return null;
          return (
            <ParameterEditor
              value={String(comp.parameters.value || '')}
              parameterKey={paramKey as 'resistance' | 'capacitance'}
              position={{ x: comp.position.x, y: comp.position.y - 40 }}
              onConfirm={(rawValue, displayValue) => {
                updateComponent(editingComponentId, {
                  parameters: { ...comp.parameters, [paramKey]: rawValue, value: displayValue },
                });
                setEditingComponentId(null);
              }}
              onCancel={() => setEditingComponentId(null)}
            />
          );
        })()}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Wire BoardView into App.tsx**

In `src/App.tsx`, replace the placeholder with the real BoardView.

Add import:
```typescript
import BoardView from './views/BoardView/BoardView';
```

Replace the placeholder div (the board-canvas div) with:
```tsx
<BoardView
  activeView={activeView}
  onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'))}
  ledStates={ledStates}
  onPotChange={useCallback((componentId: string, position: number) => {
    audioEngineRef.current?.setParam(componentId, 'position', position);
  }, [])}
  onAddProbe={handleAddProbe}
/>
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -40`

Expected: Clean or only the pre-existing SimulationEngine warning.

- [ ] **Step 4: Commit**

```bash
git add src/views/BoardView/BoardView.tsx src/App.tsx
git commit -m "feat: add BoardView main component, wire into App"
```

---

### Task 15: Verify and fix — full build and manual test

**Files:**
- Possibly any file that has remaining issues

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit 2>&1`

Fix any remaining type errors. Common issues:
- Missed `position.schematic` references (search with `grep -r "position\.schematic" src/`)
- Missed `position.breadboard` references (search with `grep -r "position\.breadboard" src/`)
- Missed `breadboard` property references on definitions (search with `grep -r "\.breadboard\b" src/components/definitions/`)

- [ ] **Step 2: Run tests**

Run: `npm test 2>&1`

Fix any test failures.

- [ ] **Step 3: Start dev server and verify**

Run: `npm run dev`

Verify:
1. Schematic view loads and renders components correctly
2. Tab key toggles to Board view
3. Board view shows green PCB background
4. Components render with physical appearance
5. Wires show as colored curves
6. Can drag components in either view
7. Can create new wires in board view
8. LED glow works when simulation is playing
9. Example circuits load correctly in both views

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve remaining type errors and integration issues for board view"
```

---

### Task 16: Handle component drag position updates in BoardView

**Files:**
- Modify: `src/views/BoardView/BoardView.tsx`

Note: The SchematicView handles component dragging via `@dnd-kit/core`'s `DragEndEvent` in `App.tsx`'s `handleDragEnd`. For dragging *existing* components (not new ones from the drawer), SchematicView handles this internally. BoardView needs the same — when a component is dragged within the board, its position should update.

- [ ] **Step 1: Check if SchematicView handles internal drag**

Read `src/views/SchematicView.tsx` to see how existing component drag updates work. The `DndContext` in `App.tsx` fires `handleDragEnd`, which currently only handles new component drops (from drawer). Internal component movement may be handled differently.

If SchematicView applies drag transforms directly via dnd-kit's `transform` (visual only while dragging) and commits position on drop, the same pattern should work in BoardView since `BoardComponent` already uses `useDraggable`.

Look for where `updateComponent` is called with a new position after drag. If this happens in `SchematicView.tsx`, replicate the same logic in `BoardView.tsx`.

- [ ] **Step 2: Add drag end handling if needed**

If internal component drag position commits happen in SchematicView, add equivalent handling in BoardView. The pattern is typically:

```typescript
// In the DragEndEvent handler or a useEffect watching drag state:
if (dragEndedComponent) {
  const snappedX = snapToGrid(newX);
  const snappedY = snapToGrid(newY);
  updateComponent(componentId, { position: { x: snappedX, y: snappedY } });
}
```

- [ ] **Step 3: Commit if changes were needed**

```bash
git add src/views/BoardView/BoardView.tsx
git commit -m "fix: handle component drag position updates in BoardView"
```
