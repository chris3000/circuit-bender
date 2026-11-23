/**
 * Parts as they sit on the board: the same drawings as on the parts shelf
 * (`partArt.tsx`), so a part looks like itself wherever it is.
 *
 * What differs is the leads. A part's pins are where its schematic symbol has
 * them — a transistor's base on the left, a capacitor's one each side — and on
 * the board its legs are simply bent to reach them. That is not how every part
 * leaves the factory (a real disc capacitor has both legs on one side), but it
 * keeps the board wired the way the schematic is, which matters more here.
 *
 * Each drawing is centred on the part's centre and stays inside its board
 * `dimensions` (plus any `overhang` it declares for text).
 */
import type { ReactNode } from 'react';
import type { ComponentParameters } from '@/types/circuit';
import { KNOB_MIN_ANGLE, KNOB_SWEEP } from '@/components/art/knob';
import { formatValue } from '@/utils/parameterParser';
import {
  BLACK, BRASS, BRASS_DARK, METAL, METAL_DARK, METAL_LIGHT, PRINT_FONT, Print,
  capacitorBody, capacitorKind, diodeBody, groundArt, jackBody, ledBody, resistorBody, switchBody, transistorBody,
} from './partArt';

type Art = (params: ComponentParameters) => ReactNode;
type Point = [number, number];

/** A lead from a pin to the part's body: tinned wire, lit from above and the left. */
function Leg({ from, to, dim = false }: { from: Point; to: Point; dim?: boolean }) {
  const vertical = from[0] === to[0];
  return (
    <>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={dim ? '#6E7378' : METAL_DARK} strokeWidth={2.8} strokeLinecap="round" />
      {!dim && (
        <line x1={from[0] - (vertical ? 0.5 : 0)} y1={from[1] - (vertical ? 0 : 0.5)} x2={to[0] - (vertical ? 0.5 : 0)} y2={to[1] - (vertical ? 0 : 0.5)}
          stroke={METAL_LIGHT} strokeWidth={0.9} strokeLinecap="round" />
      )}
    </>
  );
}

/** Lettering printed on the board itself, beside a part. */
function Silk({ y, size = 8, bold = false, children }: { y: number; size?: number; bold?: boolean; children: ReactNode }) {
  return (
    <text x={0} y={y} textAnchor="middle" fontSize={size} fontWeight={bold ? 'bold' : undefined} fill="#D4ECD4" opacity={0.85} fontFamily={PRINT_FONT}>
      {children}
    </text>
  );
}

/** Resistor: pins at (±30, 0). */
export const resistorBoard: Art = (params) => (
  <g>
    <Leg from={[-30, 0]} to={[-16, 0]} />
    <Leg from={[30, 0]} to={[16, 0]} />
    <g transform="scale(1.25)">{resistorBody(params)}</g>
    <Silk y={20}>{params.value}</Silk>
  </g>
);

/** Capacitor: pins at (±20, 0), one leg out of each side whatever kind it is. */
export const capacitorBoard: Art = (params) => {
  const kind = capacitorKind(Number(params.capacitance));
  const scale = kind === 'electrolytic' ? 1.1 : 1.15;
  const reach = kind === 'electrolytic' ? 13 : kind === 'film' ? 11 : 10;
  return (
    <g>
      <Leg from={[-20, 0]} to={[-reach, 0]} />
      <Leg from={[20, 0]} to={[reach, 0]} />
      {/* A green capacitor on a green board needs an edge to be seen by */}
      {kind === 'film' && <rect x={-12.9} y={-10.6} width={25.8} height={21.2} rx={6.6} fill="none" stroke="#CFEBDB" strokeWidth={1.1} />}
      <g transform={`scale(${scale})`}>{capacitorBody(params)}</g>
      <Silk y={21}>{params.value}</Silk>
    </g>
  );
};

/** Diode: anode at (-20, 0), cathode (the banded end) at (20, 0). */
export const diodeBoard: Art = (params) => (
  <g>
    <Leg from={[-20, 0]} to={[-10, 0]} />
    <Leg from={[20, 0]} to={[10, 0]} />
    <g transform="scale(1.3)">{diodeBody(params)}</g>
    <Silk y={16} size={7}>1N914</Silk>
  </g>
);

/** How far above the pins the middle of the LED's dome is (for its glow). */
export const LED_DOME_CENTRE = -9;

/** LED: standing on its legs, anode at (-20, 0), cathode at (20, 0), the dome above them. */
export const ledBoard: Art = (params) => (
  <g>
    <Leg from={[-20, 0]} to={[-7, 0]} />
    <Leg from={[20, 0]} to={[7, 0]} />
    {/* The shelf drawing stood on end, lit from the same side */}
    <g transform="translate(0 2) scale(1.25) rotate(90) scale(1 -1)">{ledBody(params)}</g>
    <Silk y={14}>LED</Silk>
  </g>
);

/** Transistor: base at (-25, 0), collector at (0, -25), emitter at (0, 25), as on the schematic. */
export function transistorBoard(marking: [string, string]): Art {
  return () => (
    <g>
      <Leg from={[-25, 0]} to={[-10, 0]} />
      <Leg from={[0, -25]} to={[0, -9]} />
      <Leg from={[0, 25]} to={[0, 9]} />
      <g transform="scale(1.4)">{transistorBody(marking)}</g>
    </g>
  );
}

/** Switch: pins at (±25, 0), either side of the body. */
export const switchBoard: Art = (params) => (
  <g>
    <Leg from={[-25, 0]} to={[-12, 0]} />
    <Leg from={[25, 0]} to={[12, 0]} />
    <g transform="translate(0 -3.8) scale(1.4)">{switchBody(params)}</g>
    <Silk y={24}>{Number(params.closed) >= 1 ? 'ON' : 'OFF'}</Silk>
  </g>
);

/** The supply: a 9 V battery stood on end, + at (0, -30) and − at (0, 30). */
export const batteryBoard: Art = (params) => (
  <g>
    <Leg from={[0, -30]} to={[0, -26]} />
    <Leg from={[0, 30]} to={[0, 26]} />
    <rect x={-4.5} y={-27.5} width={9} height={4} rx={1} fill={METAL} stroke={METAL_DARK} strokeWidth={0.5} />
    <rect x={-5.5} y={23.5} width={11} height={4} rx={1} fill={METAL} stroke={METAL_DARK} strokeWidth={0.5} />
    <rect x={-14} y={-24} width={28} height={48} rx={2.6} fill={BLACK} />
    <rect x={-14} y={-24} width={28} height={13} rx={2.6} fill="#C9803A" />
    <rect x={-14} y={-14.5} width={28} height={3.5} fill="#C9803A" />
    <rect x={-12} y={-22} width={2.2} height={44} rx={1.1} fill="white" opacity={0.16} />
    <rect x={9.4} y={-22} width={3} height={44} rx={1.5} fill="black" opacity={0.2} />
    <Print x={0} y={-13.6} size={10} fill="#3A2208">+</Print>
    <Print x={0} y={6.5} size={11} fill="white">{`${Number(params.voltage) || 9}V`}</Print>
    <Print x={0} y={20} size={10} fill="#9A9A9A">−</Print>
    <rect x={-14} y={-24} width={28} height={48} rx={2.6} fill="none" stroke="#0E0E0E" strokeWidth={0.7} />
  </g>
);

/** Ground: the black terminal, its pin at (0, -20). */
export const groundBoard: Art = (params) => (
  <g>
    <Leg from={[0, -20]} to={[0, -7]} />
    <g transform="translate(0 2)">{groundArt(params)}</g>
  </g>
);

/** Audio out: the jack socket, its pin at (0, -20). */
export const jackBoard: Art = (params) => (
  <g>
    <Leg from={[0, -20]} to={[0, -5]} />
    <g transform="translate(5.4 3)">{jackBody(params)}</g>
  </g>
);

interface ChipLeg { x: number; y: number; side: 'left' | 'right' | 'top'; unused?: boolean }

/**
 * A chip from above. Its legs are where the schematic symbol's pins are
 * (inputs down one side, outputs down the other), not in package order.
 */
export function chipBoard(options: {
  /** The body, relative to the part's centre. */
  left: number; top: number; width: number; height: number;
  marking: string;
  /** Smaller print under the number. */
  lines?: string[];
  legs: ChipLeg[];
}): Art {
  const { left, top, width, height, marking, lines = [], legs } = options;
  const centre = top + height / 2;
  return () => (
    <g>
      {legs.map(({ x, y, side, unused }) => {
        const fill = unused ? '#7A7F85' : METAL;
        return side === 'top'
          ? <rect key={`${x},${y}`} x={x - 1.8} y={y} width={3.6} height={7} rx={0.6} fill={fill} stroke={METAL_DARK} strokeWidth={0.4}>{unused && <title>Unused</title>}</rect>
          : <rect key={`${x},${y}`} x={side === 'left' ? x : x - 7} y={y - 1.8} width={7} height={3.6} rx={0.6} fill={fill} stroke={METAL_DARK} strokeWidth={0.4}>{unused && <title>Unused</title>}</rect>;
      })}
      <rect x={left} y={top} width={width} height={height} rx={2.4} fill={BLACK} stroke="#0E0E0E" strokeWidth={0.8} />
      {/* The notch and dot that mark pin 1's end */}
      <path d={`M-5,${top + 0.4} A5,5 0 0 0 5,${top + 0.4} Z`} fill="#0A0A0A" />
      <circle cx={left + 7} cy={top + 9} r={1.8} fill="#4C4C4C" />
      <rect x={left + 2.6} y={top + 3} width={2} height={height - 6} rx={1} fill="white" opacity={0.14} />
      <rect x={left + width - 5} y={top + 3} width={2.6} height={height - 6} rx={1.3} fill="black" opacity={0.25} />
      <Print x={left + width / 2} y={centre - (lines.length ? 3 : -2.5)} size={7.4} fill="#D2D2D2">{marking}</Print>
      {lines.map((line, i) => (
        <text key={line} x={left + width / 2} y={centre + 7 + i * 8} textAnchor="middle" fontSize={5.6} fontFamily={PRINT_FONT} fill="#8C8C8C">{line}</text>
      ))}
    </g>
  );
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Potentiometer from the front: the metal can and shaft of the shelf drawing,
 * big enough to turn, with a lug to each pin — the ends at (±25, 0), the wiper
 * at (0, -20). The pink pointer and arc show where it is set.
 */
export const potentiometerBoard: Art = (params) => {
  const position = Math.max(0, Math.min(1, Number(params.position ?? 0.5)));
  const ohms = Number(params.maxResistance ?? 1e6) * Math.max(0.001, position);
  const reading = formatValue(Number(ohms.toPrecision(2)), 'resistance');
  const from = toRadians(KNOB_MIN_ANGLE), to = toRadians(KNOB_MIN_ANGLE + KNOB_SWEEP);
  const now = toRadians(KNOB_MIN_ANGLE + position * KNOB_SWEEP);
  const track = 18.5;
  const at = (angle: number, r: number) => `${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`;
  return (
    <g>
      {/* What it is set to, above; what it is, below */}
      <Silk y={-32} size={9} bold>{reading}</Silk>
      <Silk y={36} size={9}>{params.value}</Silk>
      {/* Lugs */}
      {([[-25, 0, -18, 0], [25, 0, 18, 0], [0, -20, 0, -16]] as const).map(([x1, y1, x2, y2]) => (
        <g key={`${x1},${y1}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BRASS_DARK} strokeWidth={5} strokeLinecap="round" />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={BRASS} strokeWidth={3.8} strokeLinecap="round" />
        </g>
      ))}
      {/* Can */}
      <circle cx={0} cy={0} r={23} fill={METAL} stroke={METAL_DARK} strokeWidth={1} />
      <path d={`M ${at(toRadians(200), 20.6)} A 20.6 20.6 0 0 1 ${at(toRadians(275), 20.6)}`} fill="none" stroke="white" strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
      <path d={`M ${at(toRadians(20), 20.6)} A 20.6 20.6 0 0 1 ${at(toRadians(95), 20.6)}`} fill="none" stroke="black" strokeWidth={1.8} strokeLinecap="round" opacity={0.12} />
      {/* Where it is in its travel */}
      <path d={`M ${at(from, track)} A ${track} ${track} 0 1 1 ${at(to, track)}`} fill="none" stroke="#9499A0" strokeWidth={2.6} strokeLinecap="round" />
      {position > 0.01 && (
        <path d={`M ${at(from, track)} A ${track} ${track} 0 ${position * KNOB_SWEEP > 180 ? 1 : 0} 1 ${at(now, track)}`}
          fill="none" stroke="#FF2D55" strokeWidth={2.6} strokeLinecap="round" />
      )}
      {/* Bushing and shaft */}
      <circle cx={0} cy={0} r={13.5} fill="#AEB3B8" stroke={METAL_DARK} strokeWidth={0.8} />
      <circle cx={0} cy={0} r={9} fill={METAL_LIGHT} stroke={METAL_DARK} strokeWidth={0.8} />
      <line x1={0} y1={0} x2={Math.cos(now) * 12.5} y2={Math.sin(now) * 12.5} stroke="#FF2D55" strokeWidth={3} strokeLinecap="round" />
      <circle cx={0} cy={0} r={2.2} fill="#5E6368" />
    </g>
  );
};
