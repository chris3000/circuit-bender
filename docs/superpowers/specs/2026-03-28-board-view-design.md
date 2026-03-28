# Board View: Skeuomorphic PCB Replacement for Breadboard

## Summary

Replace the broken breadboard view with a skeuomorphic PCB board view. Components share positions between schematic and board views — switching views changes only the rendering, not the layout. Board view renders components as detailed, semi-realistic physical representations on a dark green PCB background.

## Core Design Decisions

### Shared Position System

Both views use a single `{ x, y }` position per component. Moving a component in either view moves it in both. The `position.breadboard` field and `BreadboardGrid` auto-placement algorithm are removed entirely.

This means schematic symbols and physical renderings are roughly the same size, so the circuit layout reads naturally in both views.

### SVG Rendering

Board view uses SVG (like schematic view), not Canvas. This enables:
- Consistent interaction model (drag, click, hover) shared with schematic
- Reuse of existing DnD, wiring, and selection infrastructure
- Easier animation (LED glow via SVG filters/gradients)

## Visual Design

### PCB Background

- Dark green FR4 fiberglass color (`#1a6b3c`) with subtle repeating texture pattern
- Darker border/edge (`#145530`)
- Mounting holes in corners (decorative)
- Silkscreen-style board title text in light green (`#a8d8a8`, low opacity)

### Component Rendering Style: Semi-Realistic

Each component type provides a board-view SVG renderer that draws a detailed physical representation:

| Component | Board Appearance |
|-----------|-----------------|
| resistor | Tan cylindrical body with color bands matching value, wire leads |
| capacitor | Disc ceramic (orange) or electrolytic (blue cylinder) depending on value |
| potentiometer | Circular body with rotary shaft indicator |
| cd40106 | Black DIP-14 package with pin 1 notch/dot, part number text |
| led | Translucent colored dome (uses accent color #FF2D55), flat cathode edge |
| power | Dark rectangular battery/supply block with +/- terminal markings |
| ground | Small dark block with ground bars |
| audio-output | Jack barrel shape |

All components show:
- **Silkscreen reference designators** beneath in light green (R1, C1, U1, D1, etc.) at `#a8d8a8` with reduced opacity
- **Wire leads** connecting body to pads (metallic gray gradient)

### Through-Hole Pads

- Gold radial gradient pads (`#e8c870` → `#a08030`) visible at every pin location
- Small dark drill hole center
- Always visible whether wired or not
- Wires visually terminate on these pads

### Wires

- **Curved bezier paths** — organic feel contrasting with schematic's rigid Manhattan routing
- **Route around component bounding boxes** — wires never pass under large components (especially ICs)
- **Color convention**: red (`#e04040`) = power, black/dark (`#333`) = ground, blue (`#4a82c4`) = signal
- **Pin-to-pin connection** — endpoints land precisely on through-hole pads
- Stroke width ~2.5px with round linecaps

### LED Glow Effect

When an LED is active (receiving state from audio worklet):
- The LED dome brightens (increased opacity/lighter fill)
- A soft radial gradient glow emanates on the PCB surface around the LED
- Glow intensity tracks the LED state value for variable brightness
- When off: dim/dark dome, no ambient glow

## Architecture Changes

### Files to Remove

- `src/views/BreadboardView/BreadboardView.tsx`
- `src/views/BreadboardView/BreadboardRenderer.ts`
- `src/views/BreadboardView/autoPlace.ts`
- Any `BreadboardView/` index or barrel files

### Files to Add

- `src/views/BoardView/BoardView.tsx` — main SVG board view component
- `src/views/BoardView/BoardBackground.tsx` — PCB background (green board, texture, mounting holes)
- `src/views/BoardView/BoardComponent.tsx` — wrapper that renders pads + physical component SVG
- `src/views/BoardView/BoardWire.tsx` — curved wire rendering with obstacle avoidance

### Files to Modify

**Component definitions** (`src/components/definitions/*.tsx`):
- Replace `breadboard: { renderer(ctx), dimensions }` with `board: { symbol: { width, height, render(params) → ReactNode } }` matching schematic's pattern but returning physical-look SVG elements

**Type definitions** (`src/types/circuit.ts`):
- Simplify `position` from `{ schematic: Position2D, breadboard: BreadboardPosition }` to just `Position2D` (`{ x: number, y: number }`)
- Remove `BreadboardPosition` type

**Component factory** (`src/utils/componentFactory.ts`):
- Remove breadboard auto-placement logic
- Position is just `{ x, y }` set from drop location

**App root** (`src/App.tsx`):
- Replace `BreadboardView` import/usage with `BoardView`
- View toggle continues working as-is (`'schematic' | 'board'` — rename from `'breadboard'`)
- Remove breadboard droppable zone, board view shares schematic's interaction model

**Circuit context** (`src/context/CircuitContext.tsx`):
- Update any position-related logic to use single position
- Remove breadboard-specific position handling

**DnD constants** (`src/constants/dnd.ts`):
- Remove `DROPPABLE_BREADBOARD_ID` if board view reuses schematic's droppable zone, or rename it

### Wire Routing

The board wire renderer needs awareness of component bounding boxes to route around them:
- Each component's bounding box is computed from its position + board symbol dimensions
- Wire paths use control points that avoid intersecting these boxes
- Simple approach: offset control points away from the nearest component edge
- Does not need to be a full PCB autorouter — organic curves that avoid obvious overlaps are sufficient

### Interaction Model

Board view supports the same interactions as schematic view:
- Drag component body to move
- Click pin (pad) to start/complete wiring
- Right-click wire for probe
- Hover effects on pads (highlight in accent color)
- Selection highlighting
- Component parameter editing (double-click)

This is possible because both views are SVG with the same coordinate system and shared position data.

## What Does Not Change

- Simulation engine (audio worklet, MNA solver)
- Audio engine communication
- Circuit data model (components, connections)
- Schematic view rendering
- Toolbar, sidebar, component palette
- Undo/redo system
- Example circuits (positions may need updating if breadboard positions are referenced)
- Probe/oscilloscope system
