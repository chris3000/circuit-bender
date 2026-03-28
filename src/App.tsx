import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay } from '@dnd-kit/core';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { createComponentFromDefinition } from './utils/componentFactory';
import { snapToGrid } from './utils/grid';
import { DROPPABLE_CANVAS_ID } from './constants/dnd';
import { ComponentSymbol } from './components/ComponentSymbol';
import SchematicView from './views/SchematicView';
import { ComponentDrawer } from './views/ComponentDrawer';
import { SimulationEngine } from './simulation/SimulationEngine';
import { AudioEngine } from './audio/AudioEngine';
import { AudioBridge } from './audio/AudioBridge';
import BreadboardView from './views/BreadboardView/BreadboardView';
import OscilloscopePanel from './views/Oscilloscope/OscilloscopePanel';

type ActiveView = 'schematic' | 'breadboard';

export function AppContent() {
  const { circuit, addComponent } = useCircuit();
  const [activeType, setActiveType] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('schematic');
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const simulationRef = useRef<SimulationEngine | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const audioBridgeRef = useRef<AudioBridge | null>(null);

  // Initialize simulation + audio bridge on mount
  useEffect(() => {
    const bridge = new AudioBridge();
    const audioEngine = new AudioEngine();
    const simulation = new SimulationEngine(circuit);

    audioBridgeRef.current = bridge;
    audioEngineRef.current = audioEngine;
    simulationRef.current = simulation;

    // Connect bridge flush to audio engine
    bridge.onBufferReady((samples) => {
      audioEngine.sendSamples(samples);
    });

    // Connect simulation sample callback to bridge
    simulation.setSampleCallback((sample) => {
      bridge.pushSample(sample);
    });

    return () => {
      simulation.stop();
      audioEngine.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update simulation when circuit changes
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.setCircuit(circuit);
    }
  }, [circuit]);

  // Sync volume/mute to bridge
  useEffect(() => {
    if (audioBridgeRef.current) {
      audioBridgeRef.current.setVolume(volume);
      audioBridgeRef.current.setMuted(muted);
    }
  }, [volume, muted]);

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
      setAudioStarted(true);
      // Start simulation loop
      simulationRef.current?.start();
    } catch (err) {
      console.error('Failed to start audio:', err);
    }
  }, []);

  const handleStopAudio = useCallback(() => {
    simulationRef.current?.stop();
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

    if (!over || over.id !== DROPPABLE_CANVAS_ID) {
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
          <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            {!audioStarted ? (
              <button onClick={handleStartAudio}>Start Audio</button>
            ) : (
              <button onClick={handleStopAudio}>Stop Audio</button>
            )}
            <button onClick={() => setMuted((m) => !m)}>
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              title={`Volume: ${Math.round(volume * 100)}%`}
              style={{ width: '80px' }}
            />
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
            <BreadboardView />
          )}
        </main>
        <OscilloscopePanel />
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
