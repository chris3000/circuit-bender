import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { createComponentFromDefinition } from './utils/componentFactory';
import { snapToGrid } from './utils/grid';
import { DROPPABLE_CANVAS_ID, DROPPABLE_BREADBOARD_ID } from './constants/dnd';
import { ComponentSymbol } from './components/ComponentSymbol';
import SchematicView from './views/SchematicView';
import { ComponentDrawer } from './views/ComponentDrawer';
import { AudioEngine } from './audio/AudioEngine';
import BreadboardView from './views/BreadboardView/BreadboardView';
import OscilloscopePanel from './views/Oscilloscope/OscilloscopePanel';
import { ExamplesMenu } from './views/ExamplesMenu';
import type { Circuit } from './models/Circuit';

type ActiveView = 'schematic' | 'breadboard';

export function AppContent() {
  const { circuit, addComponent } = useCircuit();
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('schematic');
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const scopeCallbackRef = useRef<((samples: Float32Array) => void) | null>(null);

  // Serialize circuit for the worklet
  const serializeCircuit = useCallback((c: Circuit) => {
    const components = c.getComponents().map(comp => ({
      id: comp.id,
      type: comp.type,
      pins: comp.pins.map(p => ({ id: p.id, label: p.label, type: p.type })),
      parameters: { ...comp.parameters },
    }));
    const connections = c.getConnections().map(conn => ({
      id: conn.id,
      from: { componentId: conn.from.componentId, pinId: conn.from.pinId },
      to: { componentId: conn.to.componentId, pinId: conn.to.pinId },
    }));
    return { components, connections };
  }, []);

  // Initialize audio engine on mount
  useEffect(() => {
    const audioEngine = new AudioEngine();
    audioEngineRef.current = audioEngine;

    // Forward worklet samples to oscilloscope
    audioEngine.onSamples((samples) => {
      if (scopeCallbackRef.current) {
        scopeCallbackRef.current(samples);
      }
    });

    return () => {
      audioEngine.close();
    };
  }, []);

  // Post circuit to worklet whenever circuit changes
  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
    }
  }, [circuit, audioStarted, serializeCircuit]);

  // Tab key handler for view toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
          return;
        }
        e.preventDefault();
        setActiveView((v) => (v === 'schematic' ? 'breadboard' : 'schematic'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartAudio = useCallback(async () => {
    if (!audioEngineRef.current) return;
    try {
      await audioEngineRef.current.initialize();
      await audioEngineRef.current.resume();

      // Send current circuit to worklet and start simulation
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
      audioEngineRef.current.startSimulation();
      setAudioStarted(true);
    } catch (err) {
      console.error('Failed to start audio:', err);
    }
  }, [circuit, serializeCircuit]);

  const handleStopAudio = useCallback(() => {
    audioEngineRef.current?.stopSimulation();
    audioEngineRef.current?.suspend();
    setAudioStarted(false);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const componentType = event.active.data.current?.componentType;
    if (componentType) {
      setActiveType(componentType);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveType(null);

    const { active, over } = event;

    if (!over || (over.id !== DROPPABLE_CANVAS_ID && over.id !== DROPPABLE_BREADBOARD_ID)) {
      return;
    }

    const componentType = active.data.current?.componentType;
    if (!componentType) {
      return;
    }

    const registry = ComponentRegistry.getInstance();
    const definition = registry.get(componentType);
    if (!definition) {
      return;
    }

    // Calculate drop position from dnd-kit event coordinates
    const overRect = over.rect;
    const activeRect = active.rect.current.translated;

    if (!activeRect) {
      return;
    }

    // The center of the dragged item relative to the droppable area
    const x = activeRect.left - overRect.left + activeRect.width / 2;
    const y = activeRect.top - overRect.top + activeRect.height / 2;

    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);

    const component = createComponentFromDefinition(definition, {
      x: snappedX,
      y: snappedY,
    });

    addComponent(component);
  }, [addComponent]);

  const handleDragCancel = useCallback(() => {
    setActiveType(null);
  }, []);

  const activeDefinition = useMemo(
    () => activeType ? ComponentRegistry.getInstance().get(activeType) : null,
    [activeType]
  );

  return (
    <DndContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="app">
        <header className="app-header">
          <h1>Circuit Bender</h1>
          <div style={{ width: '1px', height: '18px', background: '#444' }} />
          <ExamplesMenu />
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
        <main className="app-main">
          <ComponentDrawer />
          {activeView === 'schematic' ? (
            <SchematicView
              activeView={activeView}
              onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'breadboard' : 'schematic'))}
            />
          ) : (
            <BreadboardView
              activeView={activeView}
              onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'breadboard' : 'schematic'))}
            />
          )}
        </main>
        <OscilloscopePanel
          onRegisterSampleCallback={useCallback((cb: (samples: Float32Array) => void) => {
            scopeCallbackRef.current = cb;
          }, [])}
        />
      </div>
      <DragOverlay>
        {activeDefinition ? (
          <div style={{ opacity: 0.8, cursor: 'grabbing' }}>
            <ComponentSymbol
              definition={activeDefinition}
              width={60}
              height={60}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function App() {
  return (
    <CircuitProvider>
      <AppContent />
    </CircuitProvider>
  );
}

export default App;
