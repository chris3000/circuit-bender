import { useState, useRef, useEffect, useCallback } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { StorageManager } from '@/storage/StorageManager';
import { Circuit } from '@/models/Circuit';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }) + ', ' + d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const buttonStyle = (active: boolean) => ({
  background: active ? '#FF2D55' : '#333',
  border: 'none' as const,
  color: active ? 'white' : '#FF2D55',
  cursor: 'pointer' as const,
  padding: '4px 10px',
  borderRadius: '6px',
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '11px',
  fontWeight: 'bold' as const,
  letterSpacing: '0.5px',
  display: 'flex' as const,
  alignItems: 'center' as const,
  gap: '4px',
});

const dropdownStyle = {
  position: 'absolute' as const,
  top: '100%',
  left: 0,
  marginTop: 6,
  background: '#222',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  zIndex: 1000,
  width: 260,
  overflow: 'hidden' as const,
  fontFamily: "'Courier New', Courier, monospace",
};

export function SaveLoadControls() {
  const { circuit, loadCircuit } = useCircuit();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [loadOpen, setLoadOpen] = useState(false);
  const [circuits, setCircuits] = useState<ReturnType<StorageManager['listCircuits']>>([]);

  const saveRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const storageRef = useRef(new StorageManager());

  // Refresh circuit list when load dropdown opens
  useEffect(() => {
    if (loadOpen) {
      setCircuits(storageRef.current.listCircuits());
    }
  }, [loadOpen]);

  // Close save prompt on outside click
  useEffect(() => {
    if (!saveOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (saveRef.current && !saveRef.current.contains(e.target as Node)) {
        setSaveOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [saveOpen]);

  // Close load dropdown on outside click
  useEffect(() => {
    if (!loadOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (loadRef.current && !loadRef.current.contains(e.target as Node)) {
        setLoadOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [loadOpen]);

  // Focus input when save prompt opens
  useEffect(() => {
    if (saveOpen && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [saveOpen]);

  const openSavePrompt = useCallback(() => {
    setSaveName(circuit.name || '');
    setSaveOpen(true);
    setLoadOpen(false);
  }, [circuit.name]);

  const handleSave = useCallback(() => {
    const name = saveName.trim();
    if (!name) return;

    // Create a circuit copy with the chosen name via fromJSON
    const data = circuit.toJSON();
    data.name = name;
    data.metadata = { ...data.metadata, modified: new Date().toISOString() };
    const toSave = Circuit.fromJSON(data);

    storageRef.current.saveCircuit(toSave);

    // Load the named circuit back so the app tracks the saved identity
    loadCircuit(toSave);
    setSaveOpen(false);
  }, [saveName, circuit, loadCircuit]);

  const handleLoad = useCallback((id: string) => {
    const loaded = storageRef.current.loadCircuit(id);
    if (loaded) {
      loadCircuit(loaded);
    }
    setLoadOpen(false);
  }, [loadCircuit]);

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    storageRef.current.deleteCircuit(id);
    setCircuits(storageRef.current.listCircuits());
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (saveOpen) return;
        openSavePrompt();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveOpen, openSavePrompt]);

  return (
    <>
      {/* Save button + inline prompt */}
      <div ref={saveRef} style={{ position: 'relative' }}>
        <button
          onClick={openSavePrompt}
          title="Save Circuit (Cmd+S)"
          style={buttonStyle(saveOpen)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M2 1h7l2 2v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <rect x="3" y="1" width="5" height="3" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <rect x="3" y="7" width="6" height="3" rx="0.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
          </svg>
          Save
        </button>

        {saveOpen && (
          <div style={dropdownStyle}>
            <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M2 1h7l2 2v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
                  fill="none"
                  stroke="#FF2D55"
                  strokeWidth="1.2"
                />
              </svg>
              <span style={{ color: '#FF2D55', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>SAVE CIRCUIT</span>
            </div>
            <div style={{ padding: '6px 8px 10px' }}>
              <input
                ref={nameInputRef}
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setSaveOpen(false);
                }}
                placeholder="Circuit name..."
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: '#2a2a2a',
                  border: '1px solid #444',
                  borderRadius: 6,
                  color: 'white',
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: 11,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setSaveOpen(false)}
                  style={{
                    background: '#333',
                    border: 'none',
                    color: '#999',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  style={{
                    background: '#FF2D55',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Load button + dropdown */}
      <div ref={loadRef} style={{ position: 'relative' }}>
        <button
          onClick={() => { setLoadOpen((o) => !o); setSaveOpen(false); }}
          title="Load Circuit"
          style={buttonStyle(loadOpen)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path
              d="M1 3h3l1-1.5h5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H1.5a.5.5 0 0 1-.5-.5V3z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          Load
        </button>

        {loadOpen && (
          <div style={dropdownStyle}>
            <div style={{ padding: '10px 12px 6px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M1 3h3l1-1.5h5a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1H1.5a.5.5 0 0 1-.5-.5V3z"
                  fill="none"
                  stroke="#FF2D55"
                  strokeWidth="1.2"
                />
              </svg>
              <span style={{ color: '#FF2D55', fontSize: 11, fontWeight: 'bold', letterSpacing: 1 }}>SAVED CIRCUITS</span>
            </div>

            <div style={{ background: '#2a2a2a', borderRadius: 6, margin: '4px 8px 8px' }}>
              {circuits.length === 0 ? (
                <div style={{ padding: '16px 12px', color: '#666', fontSize: 11, textAlign: 'center' }}>
                  No saved circuits
                </div>
              ) : (
                circuits.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleLoad(item.id)}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid #333',
                      transition: 'background-color 0.1s ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#333'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: 'white', fontSize: 11, fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ color: '#666', fontSize: 9, marginTop: 2 }}>
                        {formatDate(item.metadata.modified)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      title="Delete"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: 14,
                        lineHeight: 1,
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#FF2D55'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#666'; }}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
