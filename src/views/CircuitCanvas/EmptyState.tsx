import { exampleCircuits } from '@/examples/circuits';
import { exampleToCircuit } from '@/examples/load';
import { useReplaceCircuit } from '@/views/ReplaceGuard';

const FONT = "'Courier New', Courier, monospace";

/** What an empty canvas says: how to begin, and two circuits to begin from. */
export function EmptyState({ viewMode }: { viewMode: 'schematic' | 'board' }) {
  const replaceCircuit = useReplaceCircuit();
  // The simplest thing that makes a sound, and the showpiece
  const starters = [
    exampleCircuits[0],
    exampleCircuits.find((e) => e.name.includes('Weird')) ?? exampleCircuits[exampleCircuits.length - 1],
  ].filter((e, i, all) => e && all.indexOf(e) === i);
  const onBoard = viewMode === 'board';

  return (
    // Lets drops and drags through to the canvas everywhere but on the buttons
    <div data-testid="empty-state" style={{
      position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 1, color: onBoard ? 'white' : '#222' }}>
          DRAG A PART ONTO THE CANVAS
        </div>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: onBoard ? '#d4ecd4' : '#666', margin: '10px 0 18px' }}>
          Pull parts in from the left, drag from pin to pin to wire them, then press ▶ to hear the circuit.
        </p>
        <div style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: 1, color: onBoard ? '#d4ecd4' : '#666', marginBottom: 8 }}>
          OR START FROM AN EXAMPLE
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', pointerEvents: 'auto' }}>
          {starters.map((example, i) => (
            <button key={example.name} onClick={() => replaceCircuit(exampleToCircuit(example))}
              style={{
                background: i === 0 ? '#FF2D55' : '#222', color: 'white', border: 'none', cursor: 'pointer',
                padding: '8px 14px', borderRadius: 10, fontFamily: FONT, fontSize: 11, fontWeight: 'bold',
              }}>
              {example.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
