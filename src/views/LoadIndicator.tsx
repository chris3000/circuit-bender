import { useEffect, useState } from 'react';
import type { LoadStatus } from '@/audio/loadStatus';

/** Somewhere to hear each new reading from; returns how to stop listening. */
export type LoadSource = (listener: (status: LoadStatus) => void) => () => void;

const SHADE = { ok: '#8A8A8A', high: '#F5F5F5', over: '#FF2D55' } as const;
const SAYS = {
  ok: 'The simulation is keeping up.',
  high: 'The simulation has little time to spare.',
  over: 'The simulation is not keeping up: the sound is breaking up.',
} as const;

/**
 * How hard the simulation is working, in the header while a circuit plays:
 * the share of the time available that it takes to compute the sound. It
 * turns white when there is little to spare and pink when the sound breaks up.
 */
export function LoadIndicator({ source }: { source: LoadSource }) {
  const [status, setStatus] = useState<LoadStatus | null>(null);
  useEffect(() => source(setStatus), [source]);

  const level = status?.level ?? 'ok';
  const percent = status ? Math.min(999, Math.round(status.load * 100)) : null;
  const shade = SHADE[level];
  return (
    <div
      role="meter" aria-label="Simulation load" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent === null ? undefined : Math.min(100, percent)}
      aria-valuetext={percent === null ? 'Measuring' : `${percent}%. ${SAYS[level]}`}
      data-testid="load-indicator" data-level={level}
      title={`${percent === null ? 'Measuring how' : `${SAYS[level]} Load ${percent}%: how`} much of the time it has the simulation needs. Near 100% the sound breaks up.`}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, marginRight: 4, cursor: 'default',
        fontFamily: "'Courier New', Courier, monospace", fontSize: 9, color: level === 'ok' ? '#666' : shade,
      }}
    >
      <span style={{ fontWeight: level === 'over' ? 'bold' : undefined, letterSpacing: level === 'over' ? 1 : undefined }}>
        {level === 'over' ? 'OVERLOAD' : 'LOAD'}
      </span>
      <span style={{ width: 36, height: 6, borderRadius: 3, background: '#3A3A3A', overflow: 'hidden', display: 'block' }}>
        <span style={{
          display: 'block', height: '100%', borderRadius: 3, background: shade,
          width: `${Math.min(100, percent ?? 0)}%`, transition: 'width 0.3s linear',
        }} />
      </span>
      {/* Wide enough for three digits, so the header does not shift as it changes */}
      <span style={{ width: 30, color: level === 'ok' ? '#999' : shade, fontSize: 10, fontWeight: level === 'ok' ? undefined : 'bold' }}>
        {percent === null ? '–' : `${percent}%`}
      </span>
    </div>
  );
}
