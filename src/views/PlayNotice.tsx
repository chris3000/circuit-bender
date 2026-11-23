import type { OverloadCause } from '@/audio/loadStatus';

interface PlayNoticeProps {
  /** Why audio could not start at all; shown as an error. */
  error: string | null;
  /** Reasons the running circuit will be silent. */
  warnings: string[];
  /** Why the sound is breaking up, when it is. */
  overload?: OverloadCause | null;
  onDismiss: () => void;
}

const OVERLOAD: Record<OverloadCause, string> = {
  circuit: 'This circuit takes longer to simulate than it takes to play. Take some parts out, or close other tabs and apps.',
  computer: 'This computer is too busy to keep the sound going, though the circuit is a light one. Close other tabs and apps.',
};

/** A message at the top of the workspace about why nothing, or something broken, can be heard. */
export function PlayNotice({ error, warnings, overload = null, onDismiss }: PlayNoticeProps) {
  const notices = error ? [{ title: 'NO SOUND', lines: [error] }] : [
    ...(overload ? [{ title: 'THE SOUND IS BREAKING UP', lines: [OVERLOAD[overload]] }] : []),
    ...(warnings.length > 0 ? [{ title: 'YOU MAY HEAR NOTHING', lines: warnings }] : []),
  ];
  if (notices.length === 0) return null;
  return (
    <div
      role={error ? 'alert' : 'status'}
      data-testid="play-notice"
      style={{
        // Centred in the room between the toolbar (top left) and the inspector (top right)
        position: 'absolute', top: 10, left: 270, right: 270, margin: '0 auto', zIndex: 50,
        width: 'fit-content', maxWidth: 520, minWidth: 260,
        background: '#222', color: 'white', borderRadius: 10, padding: '8px 10px 8px 12px',
        borderLeft: '4px solid #FF2D55', boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
        fontFamily: "'Courier New', Courier, monospace", fontSize: 11, lineHeight: 1.5,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {notices.map(({ title, lines }) => (
          <div key={title}>
            <div style={{ color: '#FF2D55', fontWeight: 'bold', letterSpacing: 1, fontSize: 10 }}>{title}</div>
            {lines.map((line) => <div key={line}>{line}</div>)}
          </div>
        ))}
      </div>
      <button onClick={onDismiss} aria-label="Dismiss" title="Dismiss" style={{
        background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px',
      }}>×</button>
    </div>
  );
}
