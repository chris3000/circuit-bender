# Board View Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the board view with physical PCB details, better labels, enhanced LED glow, component hover/shadows, solder joints, wire thickness variation, crosshatch texture, reference designators, and an animated view transition.

**Architecture:** All changes are visual — modifying SVG rendering in existing BoardView components and adding a CSS crossfade transition in App.tsx. No type changes, no new architecture.

**Tech Stack:** React, SVG, CSS transitions

---

## File Structure

### Files to Modify
| File | Change |
|------|--------|
| `src/views/BoardView/BoardBackground.tsx` | Board edge with shadow, mounting holes, crosshatch grid texture, improved SVG defs |
| `src/views/BoardView/BoardComponent.tsx` | Component drop shadows, hover glow, enhanced LED glow with animation, reference designators (R1, C1, U1, D1) |
| `src/views/BoardView/BoardWire.tsx` | Power wires thicker than signal, solder joints at endpoints |
| `src/views/BoardView/BoardPin.tsx` | Solder joint dot when wire is connected |
| `src/views/BoardView/BoardView.tsx` | Pass connection info to pins for solder joints, empty board state message |
| `src/App.tsx` | CSS crossfade transition between schematic and board views |
| `src/components/definitions/LED.tsx` | Brighter LED dome, larger size |
| All component definitions (`src/components/definitions/*.tsx`) | Brighter silkscreen labels (#d4ecd4 instead of #a8d8a8), slightly larger font |

---

### Task 1: Board edge, mounting holes, and crosshatch grid texture

**Files:**
- Modify: `src/views/BoardView/BoardBackground.tsx`

- [ ] **Step 1: Rewrite BoardBackground with board edge, shadow, mounting holes, and crosshatch**

Replace `src/views/BoardView/BoardBackground.tsx` entirely:

```tsx
import React from 'react';

// Board dimensions — components live in roughly 100-800 x 50-600 coordinate space
const BOARD_X = 60;
const BOARD_Y = 20;
const BOARD_W = 880;
const BOARD_H = 620;
const BOARD_R = 8;
const HOLE_R = 5;
const HOLE_INSET = 18;

export const BoardBackground = React.memo(function BoardBackground() {
  return (
    <g data-testid="board-background">
      <defs>
        {/* Crosshatch grid texture */}
        <pattern id="pcbCrosshatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#1a6b3c" />
          <line x1="0" y1="0" x2="8" y2="8" stroke="#1d7042" strokeWidth="0.3" opacity="0.4" />
          <line x1="8" y1="0" x2="0" y2="8" stroke="#176634" strokeWidth="0.3" opacity="0.3" />
        </pattern>
        {/* Fine dot grid overlay */}
        <pattern id="pcbDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.4" fill="#2a8050" opacity="0.4" />
        </pattern>
        {/* Through-hole pad gradient */}
        <radialGradient id="padGradient">
          <stop offset="0%" stopColor="#e8c870" />
          <stop offset="60%" stopColor="#d4aa50" />
          <stop offset="100%" stopColor="#a08030" />
        </radialGradient>
        {/* Solder joint gradient */}
        <radialGradient id="solderGradient">
          <stop offset="0%" stopColor="#e8e8e8" />
          <stop offset="40%" stopColor="#c0c0c0" />
          <stop offset="100%" stopColor="#909090" />
        </radialGradient>
        {/* LED glow — brighter and wider */}
        <radialGradient id="ledGlow">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.7" />
          <stop offset="30%" stopColor="#ff2d55" stopOpacity="0.3" />
          <stop offset="70%" stopColor="#ff2d55" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
        {/* Component shadow filter */}
        <filter id="componentShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>
        {/* Board shadow filter */}
        <filter id="boardShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="3" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.4" />
        </filter>
        {/* Mounting hole gradient */}
        <radialGradient id="mountingHole">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="70%" stopColor="#333" />
          <stop offset="100%" stopColor="#555" />
        </radialGradient>
        {/* Hover glow filter */}
        <filter id="hoverGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#FF2D55" floodOpacity="0.15" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Dark background behind board */}
      <rect width="100%" height="100%" fill="#111" />

      {/* Board with shadow */}
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="#1a6b3c"
        filter="url(#boardShadow)"
      />

      {/* Crosshatch texture */}
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="url(#pcbCrosshatch)"
      />

      {/* Dot grid overlay */}
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="url(#pcbDots)"
      />

      {/* Board edge */}
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="none"
        stroke="#145530"
        strokeWidth="2"
      />

      {/* Mounting holes */}
      {[
        [BOARD_X + HOLE_INSET, BOARD_Y + HOLE_INSET],
        [BOARD_X + BOARD_W - HOLE_INSET, BOARD_Y + HOLE_INSET],
        [BOARD_X + HOLE_INSET, BOARD_Y + BOARD_H - HOLE_INSET],
        [BOARD_X + BOARD_W - HOLE_INSET, BOARD_Y + BOARD_H - HOLE_INSET],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={HOLE_R + 2} fill="#b8943e" opacity="0.4" />
          <circle cx={cx} cy={cy} r={HOLE_R} fill="url(#mountingHole)" />
          <circle cx={cx} cy={cy} r={HOLE_R} fill="none" stroke="#555" strokeWidth="0.5" />
        </g>
      ))}

      {/* Silkscreen title */}
      <text
        x={BOARD_X + BOARD_W / 2}
        y={BOARD_Y + 14}
        textAnchor="middle"
        fill="#d4ecd4"
        fontFamily="Courier New"
        fontSize="7"
        opacity="0.4"
      >
        CIRCUIT BENDER v1.0
      </text>
    </g>
  );
});
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add src/views/BoardView/BoardBackground.tsx
git commit -m "feat: board edge with shadow, mounting holes, crosshatch grid texture"
```

---

### Task 2: Brighter labels across all component definitions

**Files:**
- Modify: All 11 files in `src/components/definitions/*.tsx`

- [ ] **Step 1: Update silkscreen label color and size in all definitions**

In every component definition file, find the board symbol's `<text>` elements that use `fill="#a8d8a8"` and change them to `fill="#d4ecd4"`. Also change `opacity="0.7"` to `opacity="0.85"` and increase `fontSize` from `"7"` or `"8"` to `"9"`.

Files and the text elements to update:

`Resistor.tsx`: The value label text — change `fill="#a8d8a8" opacity="0.7"` to `fill="#d4ecd4" opacity="0.85"` and `fontSize="8"` to `fontSize="9"`

`Capacitor.tsx`: The value label text — same changes

`LED.tsx`: The "LED" label text — same changes

`Diode1N914.tsx`: The "1N914" label text — change `fill="#a8d8a8" opacity="0.7"` to `fill="#d4ecd4" opacity="0.85"`

`Transistor2N3904.tsx`: No label text to change (has internal text only)

`CD40106.tsx`: No silkscreen label (has internal IC text only)

`LM741.tsx`: No silkscreen label (has internal IC text only)

`PowerSupply.tsx`: No silkscreen label to change (internal markings only)

`Ground.tsx`: The "GND" label text — change `fill="#a8d8a8" opacity="0.7"` to `fill="#d4ecd4" opacity="0.85"`

`AudioOutputJack.tsx`: The "OUT" label text — change `fill="#a8d8a8" opacity="0.7"` to `fill="#d4ecd4" opacity="0.85"`

`Potentiometer.tsx`: The value label text — change `fill="#a8d8a8" opacity="0.7"` to `fill="#d4ecd4" opacity="0.85"` and `fontSize="8"` to `fontSize="9"`

Use find-and-replace across all definition files: `fill="#a8d8a8" opacity="0.7"` → `fill="#d4ecd4" opacity="0.85"`

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 3: Commit**

```bash
git add src/components/definitions/
git commit -m "feat: brighter silkscreen labels on all board components"
```

---

### Task 3: Enhanced LED — brighter dome, larger, animated glow

**Files:**
- Modify: `src/components/definitions/LED.tsx:57-80`
- Modify: `src/views/BoardView/BoardComponent.tsx:147-149`

- [ ] **Step 1: Update LED board renderer with brighter, larger dome**

In `src/components/definitions/LED.tsx`, replace the entire `board:` property (lines 57-80):

```tsx
board: {
  symbol: {
    width: 50,
    height: 40,
    render: (params) => {
      const color = (params.color as string) || 'red';
      const cssColor = color === 'red' ? '#ff2d55' : color === 'green' ? '#00ff88' : color === 'blue' ? '#4488ff' : '#ff2d55';
      return (
        <g>
          {/* Leads */}
          <rect x="-20" y="-1.5" width="6" height="3" rx="1" fill="#ccc" />
          <rect x="14" y="-1.5" width="6" height="3" rx="1" fill="#ccc" />
          {/* LED dome — outer shell */}
          <ellipse cx="0" cy="0" rx="13" ry="15" fill={cssColor} opacity="0.25" stroke={cssColor} strokeWidth="1" />
          {/* Inner dome */}
          <ellipse cx="0" cy="0" rx="9" ry="11" fill={cssColor} opacity="0.45" />
          {/* Highlight */}
          <ellipse cx="-3" cy="-4" rx="4" ry="5" fill="#fff" opacity="0.15" />
          {/* Flat cathode edge */}
          <line x1="10" y1="-13" x2="10" y2="13" stroke={cssColor} strokeWidth="1.2" opacity="0.5" />
          {/* Label */}
          <text x="0" y="26" textAnchor="middle" fontSize="9" fill="#d4ecd4" opacity="0.85" fontFamily="Courier New">
            LED
          </text>
        </g>
      );
    },
  },
  dimensions: { width: 50, height: 40 },
},
```

- [ ] **Step 2: Enhance LED glow effect in BoardComponent**

In `src/views/BoardView/BoardComponent.tsx`, replace the LED glow block (lines 147-149):

```tsx
{component.type === 'led' && ledOn && (
  <>
    <ellipse cx="0" cy="0" rx="50" ry="50" fill="url(#ledGlow)" />
    <ellipse cx="0" cy="0" rx="25" ry="25" fill="url(#ledGlow)" />
  </>
)}
```

This double-stacks the glow for a brighter center that fades out more naturally.

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 4: Commit**

```bash
git add src/components/definitions/LED.tsx src/views/BoardView/BoardComponent.tsx
git commit -m "feat: larger brighter LED dome with enhanced glow effect"
```

---

### Task 4: Component drop shadows and hover glow

**Files:**
- Modify: `src/views/BoardView/BoardComponent.tsx:125-150`

- [ ] **Step 1: Add shadow filter and hover glow to component rendering**

In `src/views/BoardView/BoardComponent.tsx`, replace the inner `<g transform=...>` block (line 125 onwards, inside the return). The changes are:
1. Add `filter="url(#componentShadow)"` to the component symbol wrapper
2. Add hover state tracking
3. Apply `filter="url(#hoverGlow)"` on hover

First, add state for hover at the top of the component function (after `const { updateComponent } = useCircuit();` on line 29):

```tsx
const [hovered, setHovered] = useState(false);
```

Add the `useState` import — change line 1 from:
```tsx
import React, { useCallback, useMemo } from 'react';
```
to:
```tsx
import React, { useCallback, useMemo, useState } from 'react';
```

Then update the inner `<g>` on line 125. Replace from `<g transform=...>` through the closing `</g>` on line 176:

```tsx
      <g
        transform={`translate(${component.position.x}, ${component.position.y})`}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
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
          <>
            <ellipse cx="0" cy="0" rx="50" ry="50" fill="url(#ledGlow)" />
            <ellipse cx="0" cy="0" rx="25" ry="25" fill="url(#ledGlow)" />
          </>
        )}
        {/* Physical component with shadow and hover glow */}
        <g filter={hovered && !isDragging ? 'url(#hoverGlow)' : 'url(#componentShadow)'}>
          {definition.board.symbol.render(component.parameters)}
        </g>
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
              <text x={0} y={sliderY + 16} textAnchor="middle" fontSize="8" fill="#d4ecd4" pointerEvents="none">
                {Math.round(pos * 100)}%
              </text>
            </g>
          );
        })()}
      </g>
```

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 3: Commit**

```bash
git add src/views/BoardView/BoardComponent.tsx
git commit -m "feat: component drop shadows and hover glow effect"
```

---

### Task 5: Wire thickness variation and solder joints at endpoints

**Files:**
- Modify: `src/views/BoardView/BoardWire.tsx`

- [ ] **Step 1: Update BoardWire with thickness variation and solder dots**

Replace the entire `src/views/BoardView/BoardWire.tsx`:

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
  wireType: 'power' | 'ground' | 'signal';
  isSelected: boolean;
  onClick: (connectionId: ConnectionId) => void;
  onContextMenu?: (connectionId: ConnectionId, e: React.MouseEvent) => void;
}

function generateCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const arcHeight = Math.min(dist * 0.3, 60);
  const nx = -dy / (dist || 1);
  const ny = dx / (dist || 1);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const cx = mx + nx * arcHeight;
  const cy = my + ny * arcHeight;
  return `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
}

const WIRE_WIDTH = {
  power: 3,
  ground: 2.5,
  signal: 2,
} as const;

export const BoardWire = React.memo(function BoardWire({
  connectionId,
  fromX,
  fromY,
  toX,
  toY,
  color,
  wireType,
  isSelected,
  onClick,
  onContextMenu,
}: BoardWireProps) {
  const pathData = generateCurvedPath(fromX, fromY, toX, toY);
  const strokeWidth = isSelected ? WIRE_WIDTH[wireType] + 1 : WIRE_WIDTH[wireType];

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
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity={0.85}
        style={{ pointerEvents: 'none' }}
      />
      {/* Solder joints at endpoints */}
      <circle cx={fromX} cy={fromY} r={strokeWidth * 0.8} fill="url(#solderGradient)" opacity="0.9" style={{ pointerEvents: 'none' }} />
      <circle cx={toX} cy={toY} r={strokeWidth * 0.8} fill="url(#solderGradient)" opacity="0.9" style={{ pointerEvents: 'none' }} />
    </g>
  );
});

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
    return '#e04040';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return '#333';
  }
  return '#4a82c4';
}

export function getWireType(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): 'power' | 'ground' | 'signal' {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return 'power';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return 'ground';
  }
  return 'signal';
}
```

- [ ] **Step 2: Update BoardView to pass wireType prop**

In `src/views/BoardView/BoardView.tsx`, find the `<BoardWire` element and add the `wireType` prop. After the `color={getWireColor(...)}` line, add:

```tsx
wireType={getWireType(
  fromComp?.type || '',
  fromPin?.type || '',
  toComp?.type || '',
  toPin?.type || '',
)}
```

Also update the import to include `getWireType`:

```tsx
import { BoardWire, getWireColor, getWireType } from './BoardWire';
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 4: Commit**

```bash
git add src/views/BoardView/BoardWire.tsx src/views/BoardView/BoardView.tsx
git commit -m "feat: wire thickness by type, solder joints at wire endpoints"
```

---

### Task 6: Reference designators (R1, R2, C1, U1, D1)

**Files:**
- Modify: `src/views/BoardView/BoardComponent.tsx`

- [ ] **Step 1: Add reference designator logic**

In `src/views/BoardView/BoardComponent.tsx`, add a `refDes` prop to the interface:

```tsx
interface BoardComponentProps {
  component: Component;
  isSelected: boolean;
  ledOn?: boolean;
  refDes?: string;  // Add this
  onPinDown: (componentId: ComponentId, pinId: PinId) => void;
  onPinUp: (componentId: ComponentId, pinId: PinId) => void;
  onClick: () => void;
  onEditParameter?: (componentId: ComponentId) => void;
  onPotChange?: (componentId: ComponentId, position: number) => void;
}
```

Add `refDes` to the destructured props:

```tsx
export const BoardComponent = React.memo(function BoardComponent({
  component,
  isSelected,
  ledOn = false,
  refDes,
  // ...rest
```

Add the reference designator text just before the closing `</g>` of the inner transform group (before the pot slider block):

```tsx
{/* Reference designator */}
{refDes && (
  <text
    x={0}
    y={-height / 2 - 8}
    textAnchor="middle"
    fontSize="8"
    fill="#d4ecd4"
    opacity="0.6"
    fontFamily="Courier New"
    style={{ pointerEvents: 'none' }}
  >
    {refDes}
  </text>
)}
```

- [ ] **Step 2: Generate reference designators in BoardView**

In `src/views/BoardView/BoardView.tsx`, add a `useMemo` that computes designators from the components list. Add this after the existing `components` and `connections` memos:

```tsx
const refDesMap = useMemo(() => {
  const counters: Record<string, number> = {};
  const prefixMap: Record<string, string> = {
    resistor: 'R',
    capacitor: 'C',
    led: 'D',
    '1n914': 'D',
    '2n3904': 'Q',
    cd40106: 'U',
    lm741: 'U',
    potentiometer: 'RV',
    power: 'V',
    ground: 'GND',
    'audio-output': 'J',
  };
  const map = new Map<string, string>();
  for (const comp of components) {
    const prefix = prefixMap[comp.type] || comp.type.charAt(0).toUpperCase();
    counters[prefix] = (counters[prefix] || 0) + 1;
    map.set(comp.id, `${prefix}${counters[prefix]}`);
  }
  return map;
}, [components]);
```

Then pass it to each `<BoardComponent>`:

```tsx
<BoardComponent
  key={comp.id}
  component={comp}
  isSelected={selectedComponents.includes(comp.id)}
  ledOn={ledStates[comp.id]}
  refDes={refDesMap.get(comp.id)}
  // ...rest stays the same
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 4: Commit**

```bash
git add src/views/BoardView/BoardComponent.tsx src/views/BoardView/BoardView.tsx
git commit -m "feat: auto-generated reference designators (R1, C1, U1, D1) on board components"
```

---

### Task 7: Animated view transition (CSS crossfade)

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace conditional rendering with crossfade**

In `src/App.tsx`, replace the conditional `{activeView === 'schematic' ? ... : ...}` block (lines 232-252) with both views rendered simultaneously, using CSS opacity transitions:

```tsx
<div style={{ flex: 1, position: 'relative' }}>
  <div style={{
    position: 'absolute', inset: 0,
    opacity: activeView === 'schematic' ? 1 : 0,
    transition: 'opacity 250ms ease-in-out',
    pointerEvents: activeView === 'schematic' ? 'auto' : 'none',
    zIndex: activeView === 'schematic' ? 1 : 0,
  }}>
    <SchematicView
      activeView={activeView}
      onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'))}
      ledStates={ledStates}
      onPotChange={useCallback((componentId: string, position: number) => {
        audioEngineRef.current?.setParam(componentId, 'position', position);
      }, [])}
      onAddProbe={handleAddProbe}
    />
  </div>
  <div style={{
    position: 'absolute', inset: 0,
    opacity: activeView === 'board' ? 1 : 0,
    transition: 'opacity 250ms ease-in-out',
    pointerEvents: activeView === 'board' ? 'auto' : 'none',
    zIndex: activeView === 'board' ? 1 : 0,
  }}>
    <BoardView
      activeView={activeView}
      onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'))}
      ledStates={ledStates}
      onPotChange={useCallback((componentId: string, position: number) => {
        audioEngineRef.current?.setParam(componentId, 'position', position);
      }, [])}
      onAddProbe={handleAddProbe}
    />
  </div>
</div>
```

Note: Both views are now always mounted. The inactive view has `opacity: 0` and `pointerEvents: none`.

- [ ] **Step 2: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: 250ms crossfade transition between schematic and board views"
```

---

### Task 8: Empty board state message

**Files:**
- Modify: `src/views/BoardView/BoardView.tsx`

- [ ] **Step 1: Add empty state message**

In `src/views/BoardView/BoardView.tsx`, inside the `<svg>` element, after `<BoardBackground />` and before the connections map, add:

```tsx
{/* Empty state message */}
{components.length === 0 && (
  <g>
    <text
      x={500}
      y={300}
      textAnchor="middle"
      fontSize="16"
      fill="#d4ecd4"
      opacity="0.3"
      fontFamily="Courier New"
    >
      Drag a component to start
    </text>
    <text
      x={500}
      y={322}
      textAnchor="middle"
      fontSize="10"
      fill="#d4ecd4"
      opacity="0.2"
      fontFamily="Courier New"
    >
      from the sidebar on the left
    </text>
  </g>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/views/BoardView/BoardView.tsx
git commit -m "feat: empty board state message styled for PCB context"
```

---

### Task 9: Verify everything works together

- [ ] **Step 1: Run type check**

Run: `npx tsc --noEmit 2>&1 | grep -v TS6133`

Expected: Clean.

- [ ] **Step 2: Start dev server and verify**

Run: `npm run dev`

Verify in browser:
1. Board has defined edge with shadow on dark background
2. Mounting holes visible in corners
3. Crosshatch/dot texture visible on the green board
4. Component labels are bright and legible
5. LED dome is larger and brighter
6. Components have subtle drop shadows
7. Hovering a component shows pink glow
8. Wires: power (thick red), signal (medium blue), ground (medium dark)
9. Solder dots visible at wire-to-pad connections
10. Reference designators (R1, R2, C1, U1, D1) above each component
11. Switching views shows a smooth 250ms crossfade
12. Empty board shows "Drag a component to start" message
13. LED glow is visible and bright when simulation is playing

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish pass integration fixes"
```
