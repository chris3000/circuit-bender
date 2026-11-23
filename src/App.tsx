import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { CircuitProvider } from './context/CircuitContext';
import { useCircuit } from './context/CircuitContext';
import { ComponentDrawer } from './views/ComponentDrawer';
import { AudioEngine } from './audio/AudioEngine';
import OscilloscopePanel from './views/Oscilloscope/OscilloscopePanel';
import { ExamplesMenu } from './views/ExamplesMenu';
import { SaveLoadControls } from './views/SaveLoadControls';
import CircuitCanvas from './views/CircuitCanvas/CircuitCanvas';
import { ReplaceGuard } from './views/ReplaceGuard';
import { CircuitTitle } from './views/CircuitTitle';
import { PlayNotice } from './views/PlayNotice';
import { LoadIndicator } from './views/LoadIndicator';
import { LoadWatch, type LoadStatus, type OverloadCause } from './audio/loadStatus';
import { readAutosave, writeAutosave } from './storage/autosave';
import { playbackWarnings } from './utils/circuitChecks';
import { CoverView } from './views/Cover/CoverView';
import { nextView, type ActiveView } from './views/viewModes';
import { isPlayShortcut } from './utils/keyboard';
import type { Circuit } from './models/Circuit';
import type { Bend } from './views/CircuitCanvas/BendTool';

export function AppContent() {
  const { circuit, isDirty } = useCircuit();
  const [activeView, setActiveView] = useState<ActiveView>('schematic');
  // Behind the cover the canvas stays as it was last drawn
  const canvasView = useRef<'schematic' | 'board'>('schematic');
  if (activeView !== 'cover') canvasView.current = activeView;
  const [audioStarted, setAudioStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const scopeCallbackRef = useRef<((samples: Float32Array, probeData?: Float32Array[]) => void) | null>(null);
  // Whoever wants to know how loud the output is (the cover's level meter)
  const levelListeners = useRef(new Set<(peak: number) => void>());
  const levels = useCallback((listener: (peak: number) => void) => {
    levelListeners.current.add(listener);
    return () => { levelListeners.current.delete(listener); };
  }, []);
  // How hard the simulation is working: the header's meter listens for every
  // reading, the app itself only for the sound starting or ceasing to break up
  const loadWatch = useRef(new LoadWatch());
  const loadListeners = useRef(new Set<(status: LoadStatus) => void>());
  const loadSource = useCallback((listener: (status: LoadStatus) => void) => {
    loadListeners.current.add(listener);
    return () => { loadListeners.current.delete(listener); };
  }, []);
  const [overload, setOverload] = useState<OverloadCause | null>(null);
  const [ledStates, setLedStates] = useState<Record<string, boolean>>({});
  const [probes, setProbes] = useState<Array<{ componentId: string; pinId: string; label: string }>>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [dismissedNotice, setDismissedNotice] = useState('');

  // Keep the canvas in this browser as it is edited, so a reload or a closed
  // tab loses nothing. Written a moment after the last change, and at once
  // when the page is being left.
  const latest = useRef({ circuit, isDirty });
  latest.current = { circuit, isDirty };
  useEffect(() => {
    const timer = setTimeout(() => writeAutosave(circuit, isDirty), 400);
    return () => clearTimeout(timer);
  }, [circuit, isDirty]);
  useEffect(() => {
    const flush = () => writeAutosave(latest.current.circuit, latest.current.isDirty);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // While playing, say so if the circuit cannot make a sound
  const warnings = useMemo(() => (audioStarted ? playbackWarnings(circuit) : []), [audioStarted, circuit]);
  const noticeKey = startError ?? [overload ?? '', ...warnings].join('|');
  // A reason for not starting is out of date once the circuit has been edited
  useEffect(() => setStartError(null), [circuit]);

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
      if (levelListeners.current.size > 0) {
        let peak = 0;
        for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
        for (const listener of levelListeners.current) listener(peak);
      }
    });
    // The worklet reports LED states many times a second; only a change needs a render
    audioEngine.onLedStates((states) => setLedStates((prev) => {
      const ids = Object.keys(states);
      const same = ids.length === Object.keys(prev).length && ids.every((id) => prev[id] === states[id]);
      return same ? prev : states;
    }));
    audioEngine.onLoad((report) => {
      const status = loadWatch.current.add(report);
      for (const listener of loadListeners.current) listener(status);
      setOverload(status.cause);
    });
    return () => { audioEngine.close(); };
  }, []);

  useEffect(() => {
    audioEngineRef.current?.setVolume(volume);
    audioEngineRef.current?.setMuted(muted);
  }, [volume, muted]);

  useEffect(() => {
    if (audioEngineRef.current && audioStarted) {
      // Only an actual change to the circuit restarts the simulation; knobs,
      // switches and moving parts around do not
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.updateCircuit(components, connections);
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

  // A jumper held on the canvas goes straight to the running simulation: it is not part of the circuit
  const handleBend = useCallback((bend: Bend | null) => {
    audioEngineRef.current?.setBend(bend);
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
        setActiveView(nextView);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartAudio = useCallback(async () => {
    if (!audioEngineRef.current) return;
    setStartError(null);
    setDismissedNotice('');
    if (circuit.getComponents().length === 0) {
      setStartError(playbackWarnings(circuit)[0]);
      return;
    }
    try {
      await audioEngineRef.current.initialize();
      await audioEngineRef.current.resume();
      const { components, connections } = serializeCircuit(circuit);
      audioEngineRef.current.loadCircuit(components, connections);
      loadWatch.current.reset();
      audioEngineRef.current.startSimulation();
      setAudioStarted(true);
    } catch (err) {
      console.error('Failed to start audio:', err);
      const reason = err instanceof Error && err.message ? ` (${err.message})` : '';
      setStartError(`The audio engine could not start${reason}. Check that this tab is allowed to play sound, then press play again.`);
    }
  }, [circuit, serializeCircuit]);

  const handleStopAudio = useCallback(() => {
    audioEngineRef.current?.stopSimulation();
    audioEngineRef.current?.suspend();
    setAudioStarted(false);
    setOverload(null);
  }, []);

  // Space plays and stops, wherever the mouse last clicked, unless it is
  // being typed. Heard before anything else on the page (capture), so panels
  // that keep their keys to themselves do not swallow it.
  const togglePlay = useRef<() => void>(handleStartAudio);
  togglePlay.current = audioStarted ? handleStopAudio : handleStartAudio;
  useEffect(() => {
    let taken = false;
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      if (e.repeat) { if (taken) e.preventDefault(); return; }
      taken = isPlayShortcut(e);
      if (!taken) return;
      // Nothing else is to act on it: no page scroll, no press of a button
      // that kept the focus after a click
      e.preventDefault();
      e.stopPropagation();
      togglePlay.current();
    };
    // A button is pressed when Space comes back up: that has to be stopped too
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !taken) return;
      taken = false;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Circuit Bender</h1>
        <div style={{ width: '1px', height: '18px', background: '#444' }} />
        <ExamplesMenu />
        <SaveLoadControls />
        <CircuitTitle />
        <div className="audio-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {audioStarted && <LoadIndicator source={loadSource} />}
          {!audioStarted ? (
            <button className="play-btn" onClick={handleStartAudio} aria-label="Play" title="Play (Space)">&#9654;</button>
          ) : (
            <button className="play-btn" onClick={handleStopAudio} aria-label="Stop" title="Stop (Space)">&#9632;</button>
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
      <main className="app-main" style={{ position: 'relative' }}>
        <ComponentDrawer />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', position: 'relative' }}>
          {noticeKey !== dismissedNotice && (
            <PlayNotice error={startError} warnings={warnings} overload={overload}
              onDismiss={() => { setDismissedNotice(noticeKey); setStartError(null); }} />
          )}
          <CircuitCanvas
            viewMode={canvasView.current}
            activeView={activeView}
            onSelectView={setActiveView}
            hidden={activeView === 'cover'}
            ledStates={ledStates}
            onAddProbe={handleAddProbe}
            playing={audioStarted}
            onBend={handleBend}
          />
          {activeView === 'cover' && (
            <CoverView activeView={activeView} onSelectView={setActiveView}
              ledStates={ledStates} playing={audioStarted} levels={levels} />
          )}
        </div>
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
  // Pick up where the last visit left off
  const [restored] = useState(readAutosave);
  return (
    <CircuitProvider initial={restored}>
      <ReplaceGuard>
        <AppContent />
      </ReplaceGuard>
    </CircuitProvider>
  );
}

export default App;
