import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import type { Circuit } from '@/models/Circuit';

/** `unsaved`: the new circuit is work that has not been kept anywhere yet (a class's circuit), not a file that was opened. */
type Replace = (next: Circuit, options?: { unsaved?: boolean }) => void;

const ReplaceContext = createContext<Replace>(() => {});

/**
 * Put another circuit on the canvas in place of the current one. If the
 * current one has changes that are not saved, the person is asked first.
 */
export function useReplaceCircuit(): Replace {
  return useContext(ReplaceContext);
}

const FONT = "'Courier New', Courier, monospace";

export function ReplaceGuard({ children }: { children: ReactNode }) {
  const { circuit, isDirty, loadCircuit } = useCircuit();
  const [pending, setPending] = useState<{ circuit: Circuit; unsaved: boolean } | null>(null);

  const replace = useCallback<Replace>((next, options) => {
    const unsaved = options?.unsaved === true;
    // An emptied canvas has nothing left to lose
    if (isDirty && circuit.getComponents().length > 0) setPending({ circuit: next, unsaved });
    else loadCircuit(next, { dirty: unsaved });
  }, [circuit, isDirty, loadCircuit]);

  const cancel = useCallback(() => setPending(null), []);
  const confirm = useCallback(() => {
    if (pending) loadCircuit(pending.circuit, { dirty: pending.unsaved });
    setPending(null);
  }, [pending, loadCircuit]);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, cancel]);

  return (
    <ReplaceContext.Provider value={replace}>
      {children}
      {pending && (
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
          }}
        >
          <div role="alertdialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-text"
            style={{ background: '#222', borderRadius: 12, padding: '16px 18px', width: 340, boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
            <div id="replace-title" style={{ color: '#FF2D55', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>
              DISCARD UNSAVED CHANGES?
            </div>
            <p id="replace-text" style={{ color: '#ddd', fontSize: 12, lineHeight: 1.5, margin: '10px 0 16px' }}>
              <b style={{ color: 'white' }}>{circuit.name}</b> has changes that are not saved.
              Opening <b style={{ color: 'white' }}>{pending.circuit.name}</b> replaces it.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button autoFocus onClick={cancel} style={{
                background: '#333', border: 'none', color: '#ddd', cursor: 'pointer', padding: '6px 12px',
                borderRadius: 8, fontFamily: FONT, fontSize: 11, fontWeight: 'bold',
              }}>Keep editing</button>
              <button onClick={confirm} style={{
                background: '#FF2D55', border: 'none', color: 'white', cursor: 'pointer', padding: '6px 12px',
                borderRadius: 8, fontFamily: FONT, fontSize: 11, fontWeight: 'bold',
              }}>Discard and open</button>
            </div>
          </div>
        </div>
      )}
    </ReplaceContext.Provider>
  );
}
