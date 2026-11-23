import { useCircuit } from '@/context/CircuitContext';

/** The circuit's name in the header, with a dot while it has unsaved changes. */
export function CircuitTitle() {
  const { circuit, isDirty } = useCircuit();
  const empty = circuit.getComponents().length === 0;
  if (empty && !isDirty) return null;
  return (
    <div
      data-testid="circuit-title"
      title={isDirty ? 'Unsaved changes. They are kept in this browser until you save.' : 'All changes saved'}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginLeft: 4,
        fontSize: 11, color: '#bbb', fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{circuit.name}</span>
      {isDirty && (
        <>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF2D55', flexShrink: 0 }} />
          <span style={{ color: '#888', fontSize: 10, whiteSpace: 'nowrap' }}>unsaved</span>
        </>
      )}
    </div>
  );
}
