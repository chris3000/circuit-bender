import { useState, useRef, useEffect, useCallback } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { Circuit } from '@/models/Circuit';
import { exampleCircuits } from '@/examples/circuits';

export function ExamplesMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { loadCircuit } = useCircuit();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleLoad = useCallback((index: number) => {
    const example = exampleCircuits[index];
    const { components, connections } = example.build();

    const newCircuit = new Circuit(example.name);
    let circuit = newCircuit as ReturnType<typeof newCircuit.addComponent>;
    for (const comp of components) {
      circuit = circuit.addComponent(comp);
    }
    for (const conn of connections) {
      circuit = circuit.addConnection(conn);
    }

    loadCircuit(circuit);
    setOpen(false);
  }, [loadCircuit]);

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Example Circuits"
        style={{
          background: open ? '#FF2D55' : '#333',
          border: 'none',
          color: open ? 'white' : '#FF2D55',
          cursor: 'pointer',
          padding: '4px 10px',
          borderRadius: '6px',
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: '11px',
          fontWeight: 'bold',
          letterSpacing: '0.5px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="2" width="10" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="4" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="1" />
          <line x1="4" y1="7" x2="7" y2="7" stroke="currentColor" strokeWidth="1" />
        </svg>
        Examples
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            background: '#222',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000,
            width: 260,
            overflow: 'hidden',
            fontFamily: "'Courier New', Courier, monospace",
          }}
        >
          <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="2" width="10" height="8" rx="1" fill="none" stroke="#FF2D55" strokeWidth="1.2" />
              <line x1="4" y1="5" x2="8" y2="5" stroke="#FF2D55" strokeWidth="1" />
              <line x1="4" y1="7" x2="7" y2="7" stroke="#FF2D55" strokeWidth="1" />
            </svg>
            <span style={{ color: '#FF2D55', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>EXAMPLES</span>
          </div>

          <div style={{ background: '#2a2a2a', borderRadius: 6, margin: '4px 8px 8px' }}>
            {exampleCircuits.map((example, i) => (
              <div
                key={i}
                onClick={() => handleLoad(i)}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderBottom: i < exampleCircuits.length - 1 ? '1px solid #333' : 'none',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#333'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  background: '#333',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="20" height="16" viewBox="0 0 20 16">
                    <path
                      d="M2,8 Q5,2 10,8 T18,8"
                      fill="none"
                      stroke="#FF2D55"
                      strokeWidth="1.2"
                    />
                  </svg>
                </div>
                <div>
                  <div style={{ color: 'white', fontSize: 11, fontWeight: 'bold' }}>{example.name}</div>
                  <div style={{ color: '#666', fontSize: 9, marginTop: 2 }}>{example.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
