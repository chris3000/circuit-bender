# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Circuit Bender's UI with the Candy Lab + Mono Pop design system — 100px icon rail sidebar, visible header with file management, unified toolbar with SVG icons, dot grid canvas, scaled breadboard, and redesigned oscilloscope panel.

**Architecture:** Pure CSS/component-level changes. No simulation engine, circuit model, or audio changes. The sidebar shrinks from 280px to 100px with icon tiles showing schematic symbols + values. The layout switches from `position: fixed` sidebar to normal flexbox flow so the header is visible. All colors shift to a monochrome + hot pink (#FF2D55) palette with monospace typography.

**Tech Stack:** React, CSS Modules, SVG, dnd-kit, HTML5 Canvas

**Spec:** `docs/superpowers/specs/2026-03-28-ui-redesign.md`

**Deferred to separate plan:** File management (New/Save/Open/Examples) from spec section 2. This is new functionality, not UI restyling, and warrants its own plan with proper persistence logic, keyboard shortcuts, and example circuit data.

---

### Task 1: Global Layout & Header

**Files:**
- Modify: `src/styles/globals.css`
- Modify: `src/App.tsx:167-223`
- Modify: `src/views/ComponentDrawer/ComponentDrawer.module.css:1-12`

- [ ] **Step 1: Update globals.css — new palette, layout, header**

Replace the entire content of `src/styles/globals.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Courier New', Courier, monospace;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #F5F5F5;
  color: #222;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  background-color: #222;
  color: white;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'Courier New', Courier, monospace;
  z-index: 200;
  flex-shrink: 0;
}

.app-header h1 {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  background: #FF2D55;
  color: white;
  padding: 3px 10px;
  border-radius: 14px;
  white-space: nowrap;
  text-transform: uppercase;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.audio-controls button {
  background: #333;
  border: none;
  color: #999;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
}

.audio-controls button:hover {
  background: #444;
  color: #ddd;
}

.audio-controls .play-btn {
  background: #FF2D55;
  color: white;
  border-radius: 12px;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.audio-controls input[type="range"] {
  accent-color: #FF2D55;
}
```

- [ ] **Step 2: Update App.tsx header — pill logo + audio controls**

In `src/App.tsx`, replace the header JSX (lines 174-196) with:

```tsx
<header className="app-header">
  <h1>Circuit Bender</h1>
  <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
    {!audioStarted ? (
      <button className="play-btn" onClick={handleStartAudio}>▶</button>
    ) : (
      <button className="play-btn" onClick={handleStopAudio}>■</button>
    )}
    <span style={{ color: '#666', fontSize: '9px' }}>VOL</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={volume}
      onChange={(e) => setVolume(Number(e.target.value))}
      title={`Volume: ${Math.round(volume * 100)}%`}
      style={{ width: '50px' }}
    />
    <button onClick={() => setMuted((m) => !m)}>
      {muted ? '🔇' : '🔊'}
    </button>
  </div>
</header>
```

- [ ] **Step 3: Remove fixed positioning from sidebar**

In `src/views/ComponentDrawer/ComponentDrawer.module.css`, change the `.drawer` class from `position: fixed` to normal flow and update width to 100px:

```css
.drawer {
  width: 100px;
  height: 100%;
  background: #EBEBEB;
  border-right: 1px solid #DDD;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Remove margin-left hack from globals.css**

The `margin-left: 280px` on `.app-main` was already replaced in step 1. Verify it's gone — the sidebar now participates in normal flex flow.

- [ ] **Step 5: Verify the app loads, header is visible**

Run: `npm run dev` and check `http://localhost:5173/`
Expected: Header spans full width with pink pill logo, audio controls on right. Sidebar is below header, not overlapping.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/App.tsx src/views/ComponentDrawer/ComponentDrawer.module.css
git commit -m "feat: redesign global layout — visible header, flex sidebar, mono+pink palette"
```

---

### Task 2: Sidebar Icon Rail

**Files:**
- Modify: `src/views/ComponentDrawer/ComponentDrawer.tsx`
- Modify: `src/views/ComponentDrawer/ComponentDrawer.module.css`
- Modify: `src/views/ComponentDrawer/ComponentCard.tsx`
- Modify: `src/views/ComponentDrawer/ComponentCard.module.css`
- Modify: `src/views/ComponentDrawer/CategorySection.module.css`

- [ ] **Step 1: Restyle ComponentDrawer.module.css for 100px rail**

Replace the full content of `src/views/ComponentDrawer/ComponentDrawer.module.css`:

```css
.drawer {
  width: 100px;
  height: 100%;
  background: #EBEBEB;
  border-right: 1px solid #DDD;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
  padding: 8px 0;
  font-family: 'Courier New', Courier, monospace;
}

.drawer::-webkit-scrollbar {
  width: 4px;
}

.drawer::-webkit-scrollbar-thumb {
  background: #CCC;
  border-radius: 2px;
}

.header {
  display: none;
}

.title {
  display: none;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.empty {
  color: #999;
  font-size: 9px;
  text-align: center;
  padding: 12px 4px;
}
```

- [ ] **Step 2: Remove SearchBar from ComponentDrawer.tsx**

In `src/views/ComponentDrawer/ComponentDrawer.tsx`, remove the SearchBar import and usage. Remove the debounce logic. Simplify to just render all components grouped by category:

Replace lines 1-108 with:

```tsx
import { useMemo } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { ComponentDefinition } from '@/types/circuit';
import { CategorySection } from './CategorySection';
import styles from './ComponentDrawer.module.css';

const CATEGORY_ORDER = ['passive', 'ic', 'control', 'power', 'active'];

const CATEGORY_LABELS: Record<string, string> = {
  passive: 'Passive',
  active: 'Active',
  ic: 'ICs',
  control: 'Ctrl',
  power: 'Power',
};

function groupByCategory(
  components: ComponentDefinition[]
): Map<string, ComponentDefinition[]> {
  const groups = new Map<string, ComponentDefinition[]>();
  for (const def of components) {
    const category = def.metadata.category;
    const existing = groups.get(category) || [];
    existing.push(def);
    groups.set(category, existing);
  }
  return groups;
}

export function ComponentDrawer() {
  const registry = ComponentRegistry.getInstance();

  const groupedComponents = useMemo(
    () => groupByCategory(registry.listAll()),
    [registry]
  );

  const sortedEntries = useMemo(() => {
    const entries = Array.from(groupedComponents.entries());
    return entries.sort(([a], [b]) => {
      const ai = CATEGORY_ORDER.indexOf(a);
      const bi = CATEGORY_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [groupedComponents]);

  return (
    <div className={styles.drawer} data-testid="component-drawer">
      <div className={styles.content}>
        {sortedEntries.map(([category, components]) => (
          <CategorySection
            key={category}
            categoryKey={category}
            title={CATEGORY_LABELS[category] || category}
            components={components}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Restyle CategorySection.module.css for divider labels**

Replace the full content of `src/views/ComponentDrawer/CategorySection.module.css`:

```css
.section {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.section + .section {
  border-top: 1px solid #CCC;
  padding-top: 8px;
  margin-top: 2px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: default;
  user-select: none;
}

.header:hover {
  background-color: transparent;
}

.title {
  font-size: 8px;
  font-weight: 400;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.chevron {
  display: none;
}

.chevronExpanded {
  display: none;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
}

.content[hidden] {
  display: none;
}

.count {
  display: none;
}
```

- [ ] **Step 4: Redesign ComponentCard for icon tile**

Replace the full content of `src/views/ComponentDrawer/ComponentCard.tsx`:

```tsx
import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ComponentDefinition } from '@/types/circuit';
import { ComponentSymbol } from '@/components/ComponentSymbol';
import styles from './ComponentCard.module.css';

interface ComponentCardProps {
  definition: ComponentDefinition;
}

function getValueLabel(definition: ComponentDefinition): string | null {
  const { type, defaultParameters } = definition;
  if (defaultParameters.value) return String(defaultParameters.value);
  if (type === 'resistor') return '1kΩ';
  if (type === 'capacitor') return '100nF';
  if (type === 'potentiometer') return '0–1MΩ';
  if (type === 'power-supply') return '+9V';
  if (type === 'cd40106') return 'CD40106';
  if (type === 'lm741') return 'LM741';
  if (type === '2n3904') return '2N3904';
  if (type === '1n914') return '1N914';
  if (type === 'led') return 'LED';
  return null;
}

export const ComponentCard = React.memo(function ComponentCard({ definition }: ComponentCardProps) {
  const { type, metadata } = definition;
  const isPower = type === 'power-supply';

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drawer-${type}`,
    data: { componentType: type },
  });

  const valueLabel = getValueLabel(definition);

  return (
    <div
      ref={setNodeRef}
      className={`${styles.card} ${isPower ? styles.cardPower : ''}`}
      data-testid={`component-card-${type}`}
      data-draggable="true"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      title={`${metadata.name}${valueLabel ? ` (${valueLabel})` : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className={styles.symbol}>
        <ComponentSymbol
          definition={definition}
          width={48}
          height={32}
          testId={`component-symbol-${type}`}
        />
      </div>
      {valueLabel && <span className={styles.value}>{valueLabel}</span>}
      <span className={styles.name}>{metadata.name}</span>
    </div>
  );
});
```

- [ ] **Step 5: Restyle ComponentCard.module.css for icon tile**

Replace the full content of `src/views/ComponentDrawer/ComponentCard.module.css`:

```css
.card {
  width: 84px;
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  background: white;
  border: 2px solid #DDD;
  border-radius: 10px;
  cursor: grab;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  font-family: 'Courier New', Courier, monospace;
}

.card:hover {
  border-color: #FF2D55;
  box-shadow: 0 2px 8px rgba(255, 45, 85, 0.15);
}

.card:active {
  cursor: grabbing;
}

.cardPower {
  background: #FF2D55;
  border-color: #FF2D55;
}

.cardPower:hover {
  border-color: #e0274c;
  box-shadow: 0 2px 8px rgba(255, 45, 85, 0.3);
}

.cardPower .symbol svg {
  color: white;
}

.cardPower .value,
.cardPower .name {
  color: white;
}

.symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 32px;
}

.value {
  font-size: 11px;
  font-weight: bold;
  color: #222;
  line-height: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 76px;
}

.name {
  font-size: 9px;
  color: #999;
  line-height: 1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 76px;
}
```

- [ ] **Step 6: Verify sidebar renders as 100px icon rail**

Run dev server, check sidebar shows icon tiles with symbols, values, and names. Tiles should be 84x72px, white with #DDD border (hot pink for power supply). Category labels should appear as tiny uppercase dividers.

- [ ] **Step 7: Commit**

```bash
git add src/views/ComponentDrawer/
git commit -m "feat: redesign sidebar as 100px icon rail with schematic symbols and values"
```

---

### Task 3: Unified Toolbar with SVG Icons

**Files:**
- Modify: `src/views/SchematicView/Toolbar.tsx`
- Modify: `src/views/SchematicView/Toolbar.module.css`
- Modify: `src/views/SchematicView.tsx:269-275`
- Modify: `src/views/SchematicView.module.css`

- [ ] **Step 1: Add zoom props to Toolbar**

In `src/views/SchematicView/Toolbar.tsx`, update the interface and component to accept zoom props:

```tsx
import React from 'react';
import styles from './Toolbar.module.css';

export type ToolMode = 'select' | 'wire' | 'pan';

interface ToolbarProps {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  activeView?: 'schematic' | 'breadboard';
  onToggleView?: () => void;
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const Toolbar = React.memo(function Toolbar({
  toolMode,
  onToolModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  activeView,
  onToggleView,
  zoom,
  onZoomIn,
  onZoomOut,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar} data-testid="tool-toolbar">
      {/* Tool mode */}
      <button
        className={`${styles.toolButton} ${toolMode === 'select' ? styles.active : ''}`}
        aria-label="Select tool"
        title="Select tool (V)"
        onClick={() => onToolModeChange('select')}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M1,13 L6,1 L8,8 L13,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button
        className={`${styles.toolButton} ${toolMode === 'wire' ? styles.active : ''}`}
        aria-label="Wire tool"
        title="Wire tool (W)"
        onClick={() => onToolModeChange('wire')}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M2,12 Q2,2 12,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="12" cy="2" r="1.5" fill="currentColor"/>
          <circle cx="2" cy="12" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      <div className={styles.divider} />

      {/* Undo/Redo */}
      <button
        className={styles.toolButton}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onClick={onUndo}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M4,5 L1,2 L4,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2,2 Q2,10 10,10 L12,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        className={styles.toolButton}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onClick={onRedo}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M10,5 L13,2 L10,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12,2 Q12,10 4,10 L2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {onToggleView && (
        <>
          <div className={styles.divider} />
          {/* View toggle */}
          <div className={styles.viewToggle}>
            <button
              className={`${styles.viewTab} ${activeView === 'schematic' ? styles.viewTabActive : ''}`}
              onClick={activeView !== 'schematic' ? onToggleView : undefined}
            >
              Schematic
            </button>
            <button
              className={`${styles.viewTab} ${activeView === 'breadboard' ? styles.viewTabActive : ''}`}
              onClick={activeView !== 'breadboard' ? onToggleView : undefined}
            >
              Board
            </button>
          </div>
        </>
      )}

      {onZoomIn && onZoomOut && zoom !== undefined && (
        <>
          <div className={styles.divider} />
          {/* Zoom */}
          <button className={styles.zoomButton} onClick={onZoomOut} aria-label="Zoom out">−</button>
          <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
          <button className={styles.zoomButton} onClick={onZoomIn} aria-label="Zoom in">+</button>
        </>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Restyle Toolbar.module.css**

Replace the full content of `src/views/SchematicView/Toolbar.module.css`:

```css
.toolbar {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
  display: flex;
  gap: 2px;
  padding: 3px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  align-items: center;
  font-family: 'Courier New', Courier, monospace;
}

.toolButton {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 7px;
  background: #F5F5F5;
  color: #666;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.toolButton:hover:not(:disabled) {
  background-color: #EBEBEB;
  color: #222;
}

.toolButton:disabled {
  color: #CCC;
  cursor: default;
}

.active {
  background-color: #222;
  color: white;
}

.active:hover {
  background-color: #333;
  color: white;
}

.divider {
  width: 1px;
  height: 18px;
  background: #E0E0E0;
  margin: 0 2px;
}

.viewToggle {
  display: flex;
  background: #F0F0F0;
  border-radius: 7px;
  overflow: hidden;
}

.viewTab {
  padding: 5px 10px;
  font-size: 10px;
  font-family: 'Courier New', Courier, monospace;
  color: #999;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.viewTab:hover {
  color: #666;
}

.viewTabActive {
  background: white;
  color: #222;
  font-weight: bold;
  border-radius: 7px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  cursor: default;
}

.zoomButton {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #F5F5F5;
  border: none;
  border-radius: 5px;
  color: #999;
  cursor: pointer;
  font-size: 12px;
  font-family: 'Courier New', Courier, monospace;
}

.zoomButton:hover {
  background: #EBEBEB;
  color: #222;
}

.zoomLabel {
  font-size: 10px;
  color: #999;
  min-width: 32px;
  text-align: center;
}
```

- [ ] **Step 3: Move zoom controls from SchematicView into Toolbar**

In `src/views/SchematicView.tsx`, remove the inline zoom controls (lines 271-275) and pass zoom props to the Toolbar instead.

Remove:
```tsx
<div className={styles.toolbar}>
  <span>Zoom: {Math.round(zoom * 100)}%</span>
  <button onClick={() => setZoom(Math.min(zoom + 0.1, 3))}>+</button>
  <button onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}>-</button>
</div>
```

Update the Toolbar call to:
```tsx
<Toolbar
  toolMode={toolMode}
  onToolModeChange={handleToolModeChange}
  onUndo={undo}
  onRedo={redo}
  canUndo={canUndo}
  canRedo={canRedo}
  activeView={activeView}
  onToggleView={onToggleView}
  zoom={zoom}
  onZoomIn={() => setZoom(Math.min(zoom + 0.1, 3))}
  onZoomOut={() => setZoom(Math.max(zoom - 0.1, 0.5))}
/>
```

- [ ] **Step 4: Clean up SchematicView.module.css**

In `src/views/SchematicView.module.css`, remove the unused `.toolbar` styles (the toolbar is now fully in Toolbar.module.css). Keep only:

```css
.container {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: #F9F9F9;
  position: relative;
}

.dropZone {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.canvas {
  flex: 1;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 5: Update drop zone highlight color**

In `src/views/SchematicView.tsx`, change the isOver highlight from `#3b82f6` to `#FF2D55`:

```tsx
style={{
  outline: isOver ? '2px dashed #FF2D55' : 'none',
}}
```

- [ ] **Step 6: Verify unified toolbar**

Run dev server. Toolbar should show: pointer icon (select) | wire icon | divider | undo | redo | divider | Schematic/Board segmented toggle | divider | − 100% +. All in one bar.

- [ ] **Step 7: Commit**

```bash
git add src/views/SchematicView/Toolbar.tsx src/views/SchematicView/Toolbar.module.css src/views/SchematicView.tsx src/views/SchematicView.module.css
git commit -m "feat: unified toolbar with SVG icons, segmented view toggle, and integrated zoom"
```

---

### Task 4: Schematic Canvas Dot Grid & Empty State

**Files:**
- Modify: `src/views/SchematicView.tsx:296-340`

- [ ] **Step 1: Add dot grid SVG pattern**

In `src/views/SchematicView.tsx`, inside the `<svg>` element (line 296+), add a dot grid pattern before the existing grid pattern. Find the existing `<defs>` block with the grid pattern and add:

```tsx
<pattern id="dotGrid" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
  <circle cx="10" cy="10" r="0.8" fill="#CCC" />
</pattern>
<rect width="100%" height="100%" fill="url(#dotGrid)" opacity="0.3" />
```

The existing grid pattern (`gridPattern`) can remain or be replaced — the dot grid supersedes it.

- [ ] **Step 2: Add empty state overlay**

In `src/views/SchematicView.tsx`, inside the `dropZone` div (after the Toolbar, before the `<svg>`), add an empty state that shows when there are no components:

```tsx
{components.length === 0 && (
  <div style={{
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    textAlign: 'center',
    fontFamily: "'Courier New', Courier, monospace",
    zIndex: 5,
    pointerEvents: 'none',
  }}>
    <div style={{
      width: 48,
      height: 48,
      background: '#EBEBEB',
      borderRadius: 12,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 12px',
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path d="M12,4 L12,20 M4,12 L20,12" stroke="#999" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </div>
    <div style={{ fontSize: 13, color: '#999', fontWeight: 'bold' }}>
      Drag a component to start
    </div>
    <div style={{ fontSize: 10, color: '#CCC', marginTop: 4 }}>
      from the sidebar on the left
    </div>
  </div>
)}
```

- [ ] **Step 3: Update selection highlight color**

Search for any selection styling that uses `#3b82f6` (blue) in the SVG rendering and replace with `#FF2D55` (hot pink). Check the `DraggableComponent` and any selection rectangle rendering.

- [ ] **Step 4: Verify dot grid and empty state**

Run dev server. Canvas should show subtle dot grid. When empty, centered "Drag a component to start" message with + icon. Message should disappear when a component is placed.

- [ ] **Step 5: Commit**

```bash
git add src/views/SchematicView.tsx
git commit -m "feat: add dot grid pattern and empty state to schematic canvas"
```

---

### Task 5: Breadboard Scaling

**Files:**
- Modify: `src/views/BreadboardView/BreadboardRenderer.ts`
- Modify: `src/views/BreadboardView/BreadboardView.tsx`

- [ ] **Step 1: Add scaling to BreadboardRenderer**

In `src/views/BreadboardView/BreadboardRenderer.ts`, update the `renderBoard()` method to accept and apply a scale factor. Add a method to get board dimensions for calculating scale:

Add after `get horizontalHeight()`:

```typescript
get boardDisplayWidth(): number {
  return this.horizontalHeight; // After 90° rotation, height becomes width
}

get boardDisplayHeight(): number {
  return this.horizontalWidth; // After 90° rotation, width becomes height
}
```

- [ ] **Step 2: Apply scale transform in BreadboardView draw callback**

In `src/views/BreadboardView/BreadboardView.tsx`, update the `draw` callback to calculate and apply a scale factor that fills the container:

```typescript
const draw = useCallback(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const renderer = new BreadboardRenderer(ctx);

  // Calculate scale to fit container
  const boardW = renderer.boardDisplayWidth;
  const boardH = renderer.boardDisplayHeight;
  const scale = Math.min(
    (canvas.width * 0.9) / boardW,
    (canvas.height * 0.9) / boardH,
    4 // max scale
  );

  // Clear and center
  renderer.clear();
  ctx.save();
  const offsetX = (canvas.width - boardW * scale) / 2;
  const offsetY = (canvas.height - boardH * scale) / 2;
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  // Draw board and components
  renderer.renderBoard();

  const components = circuit.getComponents();
  for (const component of components) {
    renderer.renderComponent(component);
  }

  // Render wires
  const connections = circuit.getConnections();
  const componentMap = new Map(
    components.map((c) => [c.id, c])
  );

  for (const connection of connections) {
    const fromComponent = componentMap.get(connection.from.componentId);
    const toComponent = componentMap.get(connection.to.componentId);
    if (!fromComponent || !toComponent) continue;

    const fromPos = renderer.boardPosition(
      fromComponent.position.breadboard.row,
      fromComponent.position.breadboard.column
    );
    const toPos = renderer.boardPosition(
      toComponent.position.breadboard.row,
      toComponent.position.breadboard.column
    );

    let color = '#4169E1';
    const fromColor = renderer.getWireColor(connection.from.componentId as string, componentMap as Map<string, typeof fromComponent>);
    const toColor = renderer.getWireColor(connection.to.componentId as string, componentMap as Map<string, typeof toComponent>);

    if (fromColor === '#FF0000' || toColor === '#FF0000') {
      color = '#FF0000';
    } else if (fromColor === '#000000' || toColor === '#000000') {
      color = '#000000';
    }

    renderer.renderWire(fromPos, toPos, color);
  }

  ctx.restore();
}, [circuit]);
```

- [ ] **Step 3: Verify breadboard scales to fill container**

Run dev server, switch to Board view. The breadboard should scale up to fill ~90% of the container, centered both horizontally and vertically.

- [ ] **Step 4: Commit**

```bash
git add src/views/BreadboardView/
git commit -m "feat: scale breadboard to fill container with centered layout"
```

---

### Task 6: Oscilloscope Panel Redesign

**Files:**
- Modify: `src/views/Oscilloscope/OscilloscopePanel.tsx`
- Modify: `src/views/Oscilloscope/OscilloscopePanel.module.css`

- [ ] **Step 1: Restyle OscilloscopePanel.module.css**

Replace the full content of `src/views/Oscilloscope/OscilloscopePanel.module.css`:

```css
.panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #222;
  border-top: 2px solid #FF2D55;
  color: #aaa;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  transition: height 0.2s ease;
  z-index: 100;
  overflow: hidden;
}

.collapsed {
  height: 32px;
}

.expanded {
  height: 240px;
}

.header {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  cursor: pointer;
  user-select: none;
}

.title {
  font-weight: bold;
  letter-spacing: 2px;
  color: #FF2D55;
  font-size: 11px;
}

.waveformPreview {
  flex: 1;
  margin: 0 12px;
  height: 20px;
  opacity: 0.5;
}

.toggleBtn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 2px 8px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
}

.toggleBtn:hover {
  color: #FF2D55;
}

.body {
  display: flex;
  height: calc(240px - 32px);
  background: #1a1a1a;
  gap: 0;
}

.probeControls {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  min-width: 140px;
  border-right: 1px solid #333;
  overflow-y: auto;
}

.addProbeBtn {
  background: #2a2a2a;
  border: 1px solid #444;
  color: #999;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  margin-bottom: 4px;
}

.addProbeBtn:hover {
  background-color: #333;
  color: #FF2D55;
  border-color: #FF2D55;
}

.probeItem {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}

.colorDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.probeLabel {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.removeBtn {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.removeBtn:hover {
  color: #FF2D55;
}

.canvasArea {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
}

.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 12px;
  min-width: 120px;
  border-left: 1px solid #333;
}

.controlGroup {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.controlLabel {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #666;
}

.controlSelect {
  background: #2a2a2a;
  border: 1px solid #444;
  color: #aaa;
  padding: 3px 4px;
  border-radius: 6px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
}

.controlSelect:focus {
  border-color: #FF2D55;
  outline: none;
}
```

- [ ] **Step 2: Update OscilloscopePanel.tsx — waveform preview in collapsed state**

In `src/views/Oscilloscope/OscilloscopePanel.tsx`, update the header to show "SCOPE" label and a waveform preview SVG when collapsed:

Replace the header JSX (lines 37-48) with:

```tsx
<div className={styles.header} onClick={() => setExpanded(!expanded)}>
  <span className={styles.title}>SCOPE</span>
  {!expanded && (
    <svg className={styles.waveformPreview} viewBox="0 0 300 20" preserveAspectRatio="none">
      <path
        d="M0,10 Q15,2 30,10 T60,10 T90,10 T120,10 T150,10 T180,10 T210,10 T240,10 T270,10 T300,10"
        stroke="#FF2D55"
        fill="none"
        strokeWidth="1"
      />
    </svg>
  )}
  {expanded && (
    <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '8px', marginRight: '12px' }}>
      <span style={{ fontSize: '9px', color: '#666' }}>{timeScale}ms/div</span>
      <span style={{ fontSize: '9px', color: '#666' }}>|</span>
      <span style={{ fontSize: '9px', color: '#666' }}>{voltScale}V/div</span>
    </div>
  )}
  <button
    className={styles.toggleBtn}
    onClick={(e) => {
      e.stopPropagation();
      setExpanded(!expanded);
    }}
  >
    {expanded ? '▼' : '▲'}
  </button>
</div>
```

- [ ] **Step 3: Verify oscilloscope panel**

Run dev server. Collapsed: dark bar with "SCOPE" in hot pink, waveform preview, ▲ button. Expanded: dark panel with probes, waveform canvas, scale controls. Hot pink top border visible in both states.

- [ ] **Step 4: Commit**

```bash
git add src/views/Oscilloscope/
git commit -m "feat: redesign oscilloscope panel with hot pink accent and waveform preview"
```

---

### Task 7: BreadboardView Toolbar + Final Polish

**Files:**
- Modify: `src/views/BreadboardView/BreadboardView.tsx`
- Modify: `src/views/BreadboardView/BreadboardView.module.css`

- [ ] **Step 1: Pass zoom props from BreadboardView toolbar**

The BreadboardView already has a Toolbar from our earlier fix. Update it to be consistent with the new Toolbar props (it currently passes `toolMode="select"` and no-op handlers, which is fine — breadboard doesn't have select/wire tools yet):

In `src/views/BreadboardView/BreadboardView.tsx`, the Toolbar call is already correct. No changes needed if it compiles.

- [ ] **Step 2: Update BreadboardView.module.css for consistent styling**

Replace the full content of `src/views/BreadboardView/BreadboardView.module.css`:

```css
.container {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #2a2a2a;
  display: flex;
  flex-direction: column;
}

.canvasWrapper {
  flex: 1;
  margin-top: 48px;
  position: relative;
  overflow: hidden;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 3: Update drop zone highlight in BreadboardView**

In `src/views/BreadboardView/BreadboardView.tsx`, change the isOver outline color from `#3b82f6` to `#FF2D55`:

```tsx
style={{ outline: isOver ? '2px dashed #FF2D55' : 'none' }}
```

- [ ] **Step 4: Full visual verification**

Run dev server. Check all views:
1. Header: pink pill logo, audio controls visible
2. Sidebar: 100px icon rail with schematic symbols, values, names
3. Schematic: dot grid, empty state, unified toolbar
4. Breadboard: scaled to fill, dark background, toolbar
5. Oscilloscope: collapsed with waveform preview, expandable
6. Colors: monochrome + #FF2D55 throughout, no blue or green

- [ ] **Step 5: Commit**

```bash
git add src/views/BreadboardView/
git commit -m "feat: finalize breadboard view styling and drop highlight"
```

- [ ] **Step 6: Final commit with all remaining changes**

```bash
git add -A
git commit -m "feat: complete UI redesign — Candy Lab + Mono Pop design system"
```
