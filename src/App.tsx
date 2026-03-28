import { useState, useCallback, useRef, useEffect } from 'react';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentDrawer } from './views/ComponentDrawer';
import { AudioEngine } from './audio/AudioEngine';
import OscilloscopePanel from './views/Oscilloscope/OscilloscopePanel';
import { ExamplesMenu } from './views/ExamplesMenu';
import CircuitCanvas from './views/CircuitCanvas/CircuitCanvas';
import type { Circuit } from './models/Circuit';

type ActiveView = 'schematic' | 'board';

export function AppContent() {
  const { circuit } = useCircuit();
  const [activeView, setActiveView] = useState<ActiveView>('schematic');
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const scopeCallbackRef = useRef<((samples: Float32Array, probeData?: Float32Array[]) => void) | null>(null);
  const [ledStates, setLedStates] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Array<{ componentId: string; pinId: string; label: string }>>([]);

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

  useEffect(() => {
    const audioEngine = new AudioEngine();
    audioEngineRef.current = audioEngine;
    audioEngine.onSamples((samples, probeData) => {
      if (scopeCallbackRef.current) scopeCallbackRef.current(samples, probeData);
    });
    audioEngine.onLedStates((states) => setLedStates(states));
    return () => { audioEngine.close(); };
  }, []);

  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
    }
  }, [circuit, audioStarted, serializeCircuit]);

  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      audioEngineRef.current.setProbes(probes.map(p => ({ componentId: p.componentId, pinId: p.pinId })));
    }
  }, [probes, audioStarted]);

  const handleAddProbe = useCallback((componentId: string, pinId: string, label: string) => {
    setProbes(prev => {
      if (prev.length >= 4) return prev;
      if (prev.some(p => p.componentId === componentId && p.pinId === pinId)) return prev;
      return [...prev, { componentId, pinId, label }];
    });
  }, []);

  const handleRemoveProbe = useCallback((index: number) => {
    setProbes(prev => prev.filter((_, i) => i !== index));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
        e.preventDefault();
        setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'));
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

  const handlePotChange = useCallback((componentId: string, position: number) => {
    audioEngineRef.current?.setParam(componentId, 'position', position);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Circuit Bender</h1>
        <div style={{ width: '1px', height: '18px', background: '#444' }} />
        <ExamplesMenu />
        <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {!audioStarted ? (
            <button className="play-btn" onClick={handleStartAudio}>&#9654;</button>
          ) : (
            <button className="play-btn" onClick={handleStopAudio}>&#9632;</button>
          )}
          <span style={{ color: '#666', fontSize: '9px' }}>VOL</span>
          <input type="range" min="0" max="1" step="0.01" value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            title={`Volume: ${Math.round(volume * 100)}%`} style={{ width: '50px' }} />
          <button onClick={() => setMuted((m) => !m)}>
            {muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}
          </button>
        </div>
      </header>
      <main className="app-main">
        <ComponentDrawer />
        <CircuitCanvas
          viewMode={activeView}
          onToggleView={() => setActiveView((v) => (v === 'schematic' ? 'board' : 'schematic'))}
          ledStates={ledStates}
          onPotChange={handlePotChange}
          onAddProbe={handleAddProbe}
        />
      </main>
      <OscilloscopePanel
        onRegisterSampleCallback={useCallback((cb: (samples: Float32Array, probeData?: Float32Array[]) => void) => {
          scopeCallbackRef.current = cb;
        }, [])}
        probes={probes}
        onRemoveProbe={handleRemoveProbe}
      />
    </div>
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
