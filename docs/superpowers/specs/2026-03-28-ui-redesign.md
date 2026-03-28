# Circuit Bender UI Redesign

**Date:** 2026-03-28
**Direction:** Candy Lab layout (playful, rounded, chunky) + Mono Pop palette (monochrome + hot pink)

## Design Principles

- **Palette:** Charcoal (#222), light gray (#F5F5F5, #EBEBEB), white, hot pink accent (#FF2D55). One accent color used sparingly for active states, audio, power, and selection.
- **Typography:** Monospace everywhere (`Courier New`, monospace). All UI text — labels, toolbar, headers, component names.
- **Shapes:** Large border-radius (8-12px) on all interactive elements. Rounded pill for brand badge. Chunky, tactile feel.
- **Layout:** Compact sidebar, single unified toolbar, oscilloscope with waveform preview. Canvas gets maximum space.

## 1. Sidebar: 100px Icon Rail

**Current:** 280px fixed drawer with search bar, collapsible accordion sections, large component cards with schematic thumbnails, category badges ("passive", "ic", "power").

**New:** 100px fixed rail with icon tiles.

### Tile Design
- **84x72px tiles** for components with values; **84x60px** for power/ground/output
- Three-line layout: SVG schematic symbol (top) + value in 11px bold (middle) + name in 9px gray (bottom)
- White background, 2px #DDD border, 10px border-radius
- Cursor: grab (draggable)

### Component Tiles
| Component | Symbol | Value Label | Name Label |
|-----------|--------|-------------|------------|
| Resistor | Zigzag symbol | 1kΩ | Resistor |
| Capacitor | Parallel plates | 100nF | Capacitor |
| CD40106 | DIP rectangle with pins | CD40106 | Schmitt Inv |
| LM741 | Op-amp triangle | LM741 | Op-Amp |
| Potentiometer | Zigzag + wiper arrow | 0–1MΩ | Pot |
| Power Supply | Circle with + cross | +9V | +9V Supply |
| Ground | Descending bars | — | Ground |
| Audio Output | Speaker icon | — | Audio Out |
| 2N3904 | Transistor symbol | 2N3904 | NPN Trans |
| 1N914 | Diode symbol | 1N914 | Signal Diode |
| LED | LED symbol | LED | LED |

### Styling
- Power supply tile: hot pink (#FF2D55) background, white text/icon
- All other tiles: white background, #222 icons, #DDD border
- Category dividers: 1px #CCC line with tiny uppercase label (8px, #999) — "Passive", "ICs", "Ctrl", "Power", "Active"
- Sidebar background: #EBEBEB with 1px #DDD right border
- Scrollable when components exceed viewport height
- Search removed from sidebar (future: Cmd+K palette)

## 2. Header Bar

**Current:** Dark blue-gray (#2c3e50) header with "Circuit Bender" h1, Start Audio button, Mute button, volume slider. Completely hidden behind the fixed sidebar.

**New:** Full-width dark header (#222) above both sidebar and canvas.

### Layout (left to right)
1. **Brand pill** — hot pink (#FF2D55) background, white text, "CIRCUIT BENDER", 14px border-radius, 800 weight, monospace, letter-spacing 1px
2. **Divider** — 1px vertical, #444, 18px tall
3. **File management icons** — New, Save, Open, Examples. Each 24x24px, #333 background, 6px border-radius, #999 SVG icons
4. **Filename** — editable text, 9px, #666, truncated with ellipsis (e.g. "untitled.cb")
5. **Flex spacer**
6. **Audio controls** — Play/Stop button (24px circle, hot pink), "VOL" label (9px, #666), volume slider (50px, #444 track, #FF2D55 fill), Mute button (24x24px icon)

### File Management
- **New** (Cmd+N): Creates blank circuit, prompts to save if unsaved changes
- **Save** (Cmd+S): Saves to localStorage; also supports JSON file export
- **Open** (Cmd+O): Opens from localStorage or JSON file import
- **Examples**: Hot pink icon, opens dropdown with starter circuits

### Examples Dropdown
- Dark background (#222) with dark card rows (#2a2a2a)
- Each row: 36x36px waveform thumbnail (hot pink on #333), name (11px bold white), description (9px #666)
- Starter circuits: Simple Oscillator, Dual Tone, Pitch Bender, AM Modulation

### Layout Fix
- The header spans full width and is NOT covered by the sidebar.
- Change layout from `position: fixed` sidebar to a flexbox layout: header is a full-width row, below it `.app-main` is a flex row containing the sidebar (100px, no fixed positioning) and the canvas area (flex: 1).
- Remove `margin-left` hack on `.app-main` — the sidebar participates in normal flow.
- Header padding: 6px 14px.

## 3. Toolbar

**Current:** Two disconnected floating elements — a "Zoom: 100% [+] [-]" control and a toolbar with emoji icons (⬆️ ⚡ ↩ ↪) plus a text "Breadboard(Tab)" button.

**New:** Single unified floating toolbar.

### Layout (left to right, separated by 1px #E0E0E0 dividers)
1. **Tool mode** — Select (pointer cursor SVG), Wire (bezier curve SVG). Active: #222 bg, white icon. Inactive: #F5F5F5 bg, #666 icon.
2. **History** — Undo, Redo (curved arrow SVGs). Disabled: #AAA icon. Enabled: #666 icon.
3. **View toggle** — Segmented control with "Schematic" and "Board". Active tab: white bg, #222 bold text, subtle shadow. Inactive: #F0F0F0 bg, #999 text.
4. **Zoom** — [-] button, "100%" text, [+] button. All #F5F5F5 bg, #999 text.

### Styling
- White background, 10px border-radius, 3px padding
- Box shadow: 0 1px 4px rgba(0,0,0,0.08)
- Button size: 30x30px, 7px border-radius
- Position: absolute, top 8px, left 8px within canvas container
- Font: 10px monospace for labels

## 4. Schematic Canvas

**Current:** Blank light gray (#f9f9f9) void. No grid, no onboarding, no guidance.

**New:** Dot grid with empty state.

### Dot Grid
- SVG pattern: 20px spacing, 0.8px radius circles, #CCC fill, 30% opacity
- Visible at all zoom levels

### Empty State (shown when no components on canvas)
- Centered vertically and horizontally
- 48x48px icon container (#EBEBEB bg, 12px border-radius) with + icon (#999)
- "Drag a component to start" — 13px bold, #999
- "or press E to load an example" — 10px, #CCC, with keyboard hint badge (#EBEBEB bg)
- Disappears as soon as first component is placed

### Selection
- Selected components: hot pink (#FF2D55) dashed border, 1.5px stroke, 4px border-radius, 4,2 dash pattern

## 5. Breadboard View

**Current:** Canvas renders at native pixel size (~130px wide vertical board in ~670px container). Over 80% is empty dark space.

**New:** Breadboard scales to fill available container height, centered horizontally, maintains aspect ratio.

### Scaling
- Calculate scale factor: `Math.min(containerWidth / boardWidth, containerHeight / boardHeight)`
- Apply CSS transform or canvas scale
- Center the board in the container
- Dark background (#2a2a2a) remains — workbench aesthetic

### Breadboard stays vertical (as implemented)

## 6. Oscilloscope Panel

**Current:** Bottom bar says "OSCILLOSCOPE" in spaced caps with a tiny triangle. Gradient background. Looks like a footer, not an instrument.

**New:** Collapsible panel with waveform preview.

### Collapsed State
- Dark background (#222), 2px hot pink (#FF2D55) top border
- "SCOPE" label — 11px bold monospace, #FF2D55, letter-spacing 2px
- Live waveform preview SVG fills middle area — #FF2D55 stroke, 0.5 opacity
- ▲ toggle button — #666, right-aligned
- Height: ~32px

### Expanded State
- Dark background (#1a1a1a), 2px hot pink top border
- Header row: "SCOPE" label, readout (ms/div, V/div, CH1), ▼ toggle
- Waveform area: ~120px height
- Grid: horizontal and vertical lines (#333, #444 for center), 0.5px stroke
- Waveform: hot pink (#FF2D55) stroke, 1.5px width
- Readout text: 9px monospace, #666, channel label in #FF2D55

## 7. Color Consistency

All zones use the same palette:
- **Header:** #222 background
- **Sidebar:** #EBEBEB background, white tiles
- **Canvas (schematic):** #F9F9F9 background
- **Canvas (breadboard):** #2a2a2a background
- **Oscilloscope:** #222 collapsed, #1a1a1a expanded
- **Accent:** #FF2D55 throughout — power, audio, selection, active states, waveforms
- No gradients anywhere. Flat colors only.

## Out of Scope

- Cmd+K search palette (future feature)
- Component parameter editing UI redesign
- Wire routing/appearance changes
- New component types
- Simulation engine changes
