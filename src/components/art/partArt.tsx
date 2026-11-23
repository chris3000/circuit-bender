/**
 * Parts as they look in the hand, for the parts shelf: a resistor with its
 * colour bands, a ceramic disc, a chip with its notch.
 *
 * Every shelf drawing (`...Art`) fits a 48 × 24 box centred on the origin, the
 * part lying on its side as it would in a tray. The style is flat with one
 * highlight and one shadow per body — enough to read as an object, no more.
 * Nothing here uses gradients, clip paths or anything else that needs an id,
 * so a drawing works wherever it is put, however many times.
 *
 * The body of a part without its leads (`...Body`, centred on the origin) is
 * drawn here once and used again on the board (`boardArt.tsx`), where the
 * leads go to wherever the part's pins are.
 */
import type { ReactNode } from 'react';
import type { ComponentParameters } from '@/types/circuit';
import { formatValue } from '@/utils/parameterParser';
import { resistorBands } from './resistorBands';

type Art = (params: ComponentParameters) => ReactNode;

export const METAL = '#C4C8CC';
export const METAL_DARK = '#8A8F95';
export const METAL_LIGHT = '#E6E8EA';
export const BLACK = '#262626';
export const BRASS = '#C9A85A';
export const BRASS_DARK = '#93783A';
export const PRINT_FONT = "'Courier New', Courier, monospace";

/** A wire lead: tinned copper, lit from above. */
function Lead({ x1, x2, y }: { x1: number; x2: number; y: number }) {
  return (
    <>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={METAL_DARK} strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x1} y1={y - 0.3} x2={x2} y2={y - 0.3} stroke={METAL_LIGHT} strokeWidth={0.5} strokeLinecap="round" />
    </>
  );
}

/** Text printed on a part. */
export function Print({ x, y, size, fill, children }: { x: number; y: number; size: number; fill: string; children: ReactNode }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="bold" fontFamily={PRINT_FONT} fill={fill}>
      {children}
    </text>
  );
}

/** A carbon-film resistor: a tan dog-bone with the value in colour bands. 28 × 11.2. */
export const resistorBody: Art = (params) => {
  const [first, second, multiplier, tolerance] = resistorBands(Number(params.resistance));
  const body = 'M-14,-3.6 Q-14,-5.6 -12,-5.6 L-9.6,-5.6 Q-8.4,-5.6 -7.6,-4.6 L7.6,-4.6 Q8.4,-5.6 9.6,-5.6 L12,-5.6'
    + ' Q14,-5.6 14,-3.6 L14,3.6 Q14,5.6 12,5.6 L9.6,5.6 Q8.4,5.6 7.6,4.6 L-7.6,4.6 Q-8.4,5.6 -9.6,5.6 L-12,5.6 Q-14,5.6 -14,3.6 Z';
  return (
    <g>
      <path d={body} fill="#E4CBA0" />
      {/* Two digits and the multiplier from one end, the tolerance band alone at the other */}
      <rect x={-12.2} y={-5.6} width={2.4} height={11.2} fill={first} />
      <rect x={-6.4} y={-4.6} width={2.4} height={9.2} fill={second} />
      <rect x={-1.6} y={-4.6} width={2.4} height={9.2} fill={multiplier} />
      <rect x={9.8} y={-5.6} width={2.4} height={11.2} fill={tolerance} />
      {/* Light along the top, shade along the bottom, over the bands as well */}
      <rect x={-12.6} y={-4.5} width={3.6} height={1.3} rx={0.6} fill="white" opacity={0.45} />
      <rect x={-7.2} y={-3.6} width={14.4} height={1.2} rx={0.6} fill="white" opacity={0.45} />
      <rect x={9} y={-4.5} width={3.6} height={1.3} rx={0.6} fill="white" opacity={0.45} />
      <rect x={-13} y={2.4} width={4.4} height={2.6} rx={1.2} fill="black" opacity={0.14} />
      <rect x={-7.6} y={1.8} width={15.2} height={2.8} fill="black" opacity={0.14} />
      <rect x={8.6} y={2.4} width={4.4} height={2.6} rx={1.2} fill="black" opacity={0.14} />
      <path d={body} fill="none" stroke="#9C7A45" strokeWidth={0.6} />
    </g>
  );
};

export const resistorArt: Art = (params) => (
  <g>
    <Lead x1={-23} x2={-13} y={0} />
    <Lead x1={13} x2={23} y={0} />
    {resistorBody(params)}
  </g>
);

/** The three-digit code printed on small capacitors: 104 is 10 followed by 4 zeros, in pF. */
export function capacitorCode(farads: number): string {
  const picofarads = farads * 1e12;
  if (!(picofarads >= 0.05)) return '';
  if (picofarads < 99.5) return String(Number(picofarads.toPrecision(2)));
  const exponent = Math.floor(Math.log10(picofarads) + 1e-9) - 1;
  const digits = Math.round(picofarads / 10 ** exponent);
  return digits >= 100 ? `10${exponent + 1}` : `${digits}${exponent}`;
}

/** The kind of capacitor a value usually comes in: a ceramic disc for the smallest, film in the middle, an electrolytic can from 1 µF. */
export function capacitorKind(farads: number): 'ceramic' | 'film' | 'electrolytic' {
  if (farads >= 1e-6 * (1 - 1e-9)) return 'electrolytic';
  return farads >= 10e-9 * (1 - 1e-9) ? 'film' : 'ceramic';
}

/** A capacitor of the kind its value comes in, its code or value printed on it. About 26 × 19 at most. */
export const capacitorBody: Art = (params) => {
  const farads = Number(params.capacitance);
  const kind = capacitorKind(farads);
  if (kind === 'electrolytic') {
    const printed = formatValue(farads, 'capacitance').replace(/F$/, '').replace('u', 'µ');
    return (
      <g>
        <rect x={-13} y={-7.5} width={26} height={15} rx={2.5} fill="#23324F" />
        <rect x={-13} y={-7.5} width={2.2} height={15} rx={1.1} fill="#8D97A9" />
        {/* The stripe that marks the negative lead */}
        <rect x={-9.5} y={2.6} width={20.5} height={3.4} fill="#C8D0DC" />
        {[-6.5, -0.5, 5.5].map((x) => <rect key={x} x={x} y={3.85} width={2.6} height={0.9} fill="#23324F" />)}
        <rect x={-9.5} y={-6} width={20.5} height={1.4} rx={0.7} fill="white" opacity={0.2} />
        <line x1={10.2} y1={-7.5} x2={10.2} y2={7.5} stroke="#121B2D" strokeWidth={0.8} />
        <Print x={0.5} y={1} size={5} fill="#E6ECF5">{printed}</Print>
        <rect x={-13} y={-7.5} width={26} height={15} rx={2.5} fill="none" stroke="#121B2D" strokeWidth={0.6} />
      </g>
    );
  }
  if (kind === 'film') {
    return (
      <g>
        <rect x={-10.5} y={-8.5} width={21} height={17} rx={5} fill="#2E7D57" stroke="#1F5A3D" strokeWidth={0.6} />
        <rect x={-7} y={-6.6} width={14} height={1.7} rx={0.85} fill="white" opacity={0.25} />
        <rect x={-8} y={4.2} width={16} height={2.6} rx={1.3} fill="black" opacity={0.14} />
        <Print x={0} y={2} size={5.6} fill="#D5EFE2">{capacitorCode(farads)}</Print>
      </g>
    );
  }
  return (
    <g>
      <circle cx={0} cy={0} r={9.6} fill="#DB9438" stroke="#A66A1E" strokeWidth={0.6} />
      <path d="M-6.6,-3.6 A7.4,7.4 0 0 1 2,-7.2" fill="none" stroke="white" strokeWidth={1.3} strokeLinecap="round" opacity={0.4} />
      <path d="M-5.4,5 A7.6,7.6 0 0 0 6.4,3.6" fill="none" stroke="black" strokeWidth={1.4} strokeLinecap="round" opacity={0.13} />
      <Print x={0} y={2} size={5.6} fill="#5A3608">{capacitorCode(farads)}</Print>
    </g>
  );
};

/** On the shelf a capacitor lies with both leads to the right, as it comes. */
export const capacitorArt: Art = (params) => {
  const kind = capacitorKind(Number(params.capacitance));
  if (kind === 'electrolytic') {
    return (
      <g>
        <Lead x1={3.5} x2={21.5} y={-3} />
        <Lead x1={3.5} x2={17.5} y={3} />
        <g transform="translate(-8.5 0)">{capacitorBody(params)}</g>
      </g>
    );
  }
  const spread = kind === 'film' ? 3.5 : 3;
  return (
    <g>
      <Lead x1={kind === 'film' ? -0.5 : -4.5} x2={21.5} y={-spread} />
      <Lead x1={kind === 'film' ? -0.5 : -4.5} x2={21.5} y={spread} />
      <g transform={`translate(${kind === 'film' ? -10 : -10.5} 0)`}>{capacitorBody(params)}</g>
    </g>
  );
};

/** A potentiometer from the front: round case, threaded bushing, slotted shaft, three lugs. */
export const potentiometerArt: Art = () => (
  <g>
    {[-6.2, -1.2, 3.8].map((x) => (
      <g key={x}>
        <rect x={x} y={5.6} width={2.4} height={6} rx={0.5} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.4} />
        <circle cx={x + 1.2} cy={9.8} r={0.55} fill="#6E5A2B" />
      </g>
    ))}
    <circle cx={0} cy={-1.6} r={9.6} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
    <path d="M-7.6,-4.6 A8.2,8.2 0 0 1 2,-9.6" fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
    <path d="M-5.2,5.2 A8.2,8.2 0 0 0 7.8,1" fill="none" stroke="black" strokeWidth={1.3} strokeLinecap="round" opacity={0.12} />
    <circle cx={0} cy={-1.6} r={5.6} fill="#AEB3B8" stroke={METAL_DARK} strokeWidth={0.5} />
    <circle cx={0} cy={-1.6} r={3.5} fill={METAL_LIGHT} stroke={METAL_DARK} strokeWidth={0.5} />
    <line x1={-2.3} y1={0} x2={2.3} y2={-3.2} stroke="#5E6368" strokeWidth={1} strokeLinecap="round" />
  </g>
);

/** A miniature toggle switch from the side, without its lugs. The blue body is 19 × 8.2, centred on (0, 2.7). */
export const switchBody: Art = (params) => {
  const on = Number(params.closed) >= 1;
  return (
    <g>
      {/* The lever: thrown one way for off, the other for on */}
      <line x1={0} y1={-5} x2={on ? -6.5 : 6.5} y2={-10.4} stroke={METAL_DARK} strokeWidth={3.2} strokeLinecap="round" />
      <line x1={0} y1={-5.4} x2={on ? -6.5 : 6.5} y2={-10.8} stroke={METAL_LIGHT} strokeWidth={1.6} strokeLinecap="round" />
      <rect x={-3.2} y={-6} width={6.4} height={4.4} fill="#D7DADD" stroke={METAL_DARK} strokeWidth={0.4} />
      {[-4.8, -3.6].map((y) => <line key={y} x1={-3.2} y1={y} x2={3.2} y2={y} stroke="#9EA3A8" strokeWidth={0.5} />)}
      <rect x={-5} y={-3} width={10} height={1.6} rx={0.4} fill="#B4B9BE" stroke={METAL_DARK} strokeWidth={0.4} />
      <rect x={-9.5} y={-1.4} width={19} height={8.2} rx={1.3} fill="#2D62B8" stroke="#1D4585" strokeWidth={0.6} />
      <rect x={-8} y={-0.3} width={16} height={1.3} rx={0.65} fill="white" opacity={0.28} />
      <rect x={-8.6} y={4} width={17.2} height={2} rx={1} fill="black" opacity={0.16} />
    </g>
  );
};

export const switchArt: Art = (params) => (
  <g transform="translate(0 0.5)">
    {[-5.6, 3.2].map((x) => <rect key={x} x={x} y={6.4} width={2.4} height={5} rx={0.5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.4} />)}
    {switchBody(params)}
  </g>
);

const LED_COLORS: Record<string, { body: string; dark: string }> = {
  red: { body: '#F0314F', dark: '#B0152F' },
  green: { body: '#2FCB6B', dark: '#178A43' },
  blue: { body: '#3F8CF2', dark: '#1F5CB3' },
};

/** A 5 mm LED: a coloured dome on a flange. The dome points left; the flange is at x = -2.6 to -0.6. */
export const ledBody: Art = (params) => {
  const { body, dark } = LED_COLORS[String(params.color)] ?? LED_COLORS.red;
  return (
    <g>
      <rect x={-2.6} y={-6.6} width={2} height={13.2} rx={0.7} fill={dark} />
      <path d="M-2.4,-5.6 L-11,-5.6 A5.6,5.6 0 0 0 -11,5.6 L-2.4,5.6 Z" fill={body} stroke={dark} strokeWidth={0.6} />
      {/* The die and its post, seen through the plastic */}
      <path d="M-2.4,-2.9 L-7.2,-2.9 L-8.6,-0.8 L-7.2,1 L-7.2,2.9 L-2.4,2.9 Z" fill={dark} opacity={0.5} />
      <path d="M-14.6,-2.6 Q-13.4,-4.3 -9.6,-4.2" fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
    </g>
  );
};

/** On the shelf the longer lead is the anode. */
export const ledArt: Art = (params) => (
  <g transform="translate(-2.5 0)">
    <Lead x1={-1} x2={24} y={-2.5} />
    <Lead x1={-1} x2={19.5} y={2.5} />
    {ledBody(params)}
  </g>
);

/** A small glass signal diode, the black band at its cathode (the right-hand end). 18 × 7.6. */
export const diodeBody: Art = () => (
  <g>
    <rect x={-9} y={-3.8} width={18} height={7.6} rx={3.2} fill="#EC7B3C" stroke="#B5501E" strokeWidth={0.6} />
    <rect x={-5} y={-1.1} width={8} height={2.2} rx={0.6} fill="#8A3410" opacity={0.45} />
    <rect x={3.4} y={-3.8} width={2.8} height={7.6} fill="#1E1E1E" />
    <rect x={-6.8} y={-2.8} width={13.6} height={1.1} rx={0.55} fill="white" opacity={0.5} />
    <rect x={-6.8} y={1.9} width={13.6} height={1.1} rx={0.55} fill="black" opacity={0.15} />
  </g>
);

export const diodeArt: Art = (params) => (
  <g>
    <Lead x1={-23} x2={-8} y={0} />
    <Lead x1={8} x2={23} y={0} />
    {diodeBody(params)}
  </g>
);

/** A TO-92 transistor's flat-faced black body, its number on the face. 17 × 15.2. */
export function transistorBody(marking: [string, string]): ReactNode {
  return (
    <g>
      <rect x={-8.5} y={-7.6} width={17} height={15.2} rx={2.4} fill={BLACK} stroke="#0E0E0E" strokeWidth={0.6} />
      <rect x={-6.7} y={-6.2} width={13.4} height={1.3} rx={0.65} fill="white" opacity={0.18} />
      <Print x={0} y={-0.4} size={4.4} fill="#C8C8C8">{marking[0]}</Print>
      <Print x={0} y={4.4} size={4.4} fill="#C8C8C8">{marking[1]}</Print>
    </g>
  );
}

/** On the shelf it lies on its back, three legs to the right. */
export function transistorArt(marking: [string, string]): Art {
  return () => (
    <g>
      {[-4, 0, 4].map((y) => <Lead key={y} x1={-4.5} x2={21.5} y={y} />)}
      <g transform="translate(-12 0)">{transistorBody(marking)}</g>
    </g>
  );
}

/** A chip in a DIP package from above: notch at pin 1's end, its number printed on top. */
export function chipArt(pinCount: number, marking: string): Art {
  const perSide = pinCount / 2;
  const pitch = 5.2;
  const width = perSide * pitch + 3;
  const left = -width / 2;
  const pins = Array.from({ length: perSide }, (_, i) => left + 1.5 + pitch / 2 + i * pitch - 1.2);
  return () => (
    <g>
      {pins.map((x) => (
        <g key={x}>
          <rect x={x} y={-8.8} width={2.4} height={4} rx={0.4} fill={METAL} stroke={METAL_DARK} strokeWidth={0.3} />
          <rect x={x} y={4.8} width={2.4} height={4} rx={0.4} fill={METAL} stroke={METAL_DARK} strokeWidth={0.3} />
        </g>
      ))}
      <rect x={left} y={-5.8} width={width} height={11.6} rx={1.2} fill={BLACK} stroke="#0E0E0E" strokeWidth={0.6} />
      <path d={`M${left + 0.3},-2 A2,2 0 0 1 ${left + 0.3},2 Z`} fill="#0A0A0A" />
      <circle cx={left + 4.4} cy={3.4} r={0.8} fill="#4C4C4C" />
      <rect x={left + 1.6} y={-4.8} width={width - 3.2} height={1.1} rx={0.55} fill="white" opacity={0.14} />
      <Print x={1.4} y={1.7} size={marking.length > 6 ? 5 : 4.8} fill="#D2D2D2">{marking}</Print>
    </g>
  );
}

/** A 9 V battery on its side, snaps at one end, the supply's voltage on the label. */
export const batteryArt: Art = (params) => (
  <g transform="translate(1 0)">
    <rect x={13} y={-5.8} width={3} height={3.6} rx={0.7} fill={METAL} stroke={METAL_DARK} strokeWidth={0.4} />
    <rect x={13} y={1.4} width={3.8} height={4.8} rx={0.9} fill={METAL} stroke={METAL_DARK} strokeWidth={0.4} />
    <rect x={-20} y={-8.6} width={33} height={17.2} rx={1.8} fill={BLACK} />
    <rect x={4.4} y={-8.6} width={8.6} height={17.2} rx={1.8} fill="#C9803A" />
    <rect x={4.4} y={-8.6} width={2.4} height={17.2} fill="#C9803A" />
    <rect x={-18.4} y={-7} width={29.8} height={1.6} rx={0.8} fill="white" opacity={0.16} />
    <rect x={-18.4} y={4.6} width={29.8} height={2.4} rx={1.2} fill="black" opacity={0.2} />
    <Print x={-8} y={2.9} size={8} fill="white">{`${Number(params.voltage) || 9}V`}</Print>
    <rect x={-20} y={-8.6} width={33} height={17.2} rx={1.8} fill="none" stroke="#0E0E0E" strokeWidth={0.6} />
  </g>
);

/** Ground is a connection, not a part: shown as the black terminal on a chassis, marked with its symbol. */
export const groundArt: Art = () => (
  <g>
    <rect x={-16} y={-9} width={32} height={18} rx={2.6} fill={BLACK} stroke="#0E0E0E" strokeWidth={0.6} />
    <rect x={-14.4} y={-7.6} width={28.8} height={1.4} rx={0.7} fill="white" opacity={0.14} />
    <circle cx={-7} cy={0} r={5.2} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
    <path d="M-10.4,-2.2 A4,4 0 0 1 -6,-4" fill="none" stroke="white" strokeWidth={1} strokeLinecap="round" opacity={0.75} />
    <circle cx={-7} cy={0} r={2.5} fill="#141414" />
    <g stroke="white" strokeLinecap="round">
      <line x1={6.5} y1={-6} x2={6.5} y2={-1.6} strokeWidth={1.3} />
      <line x1={1.6} y1={-1.6} x2={11.4} y2={-1.6} strokeWidth={1.4} />
      <line x1={3.4} y1={1.6} x2={9.6} y2={1.6} strokeWidth={1.2} />
      <line x1={5.2} y1={4.6} x2={7.8} y2={4.6} strokeWidth={1} />
    </g>
  </g>
);

/** A panel-mount jack socket from the side, without its lugs: threaded sleeve and nut, black body. Spans x = -21 to 10.2. */
export const jackBody: Art = () => (
  <g>
    <rect x={-21} y={-4.3} width={10} height={8.6} rx={0.6} fill="#D7DADD" stroke={METAL_DARK} strokeWidth={0.5} />
    {[-19.2, -17.4, -15.6, -13.8].map((x) => <line key={x} x1={x} y1={-4.3} x2={x} y2={4.3} stroke="#9EA3A8" strokeWidth={0.5} />)}
    <rect x={-21} y={-3.3} width={10} height={1.1} fill="white" opacity={0.55} />
    <rect x={-12.6} y={-6.8} width={3.4} height={13.6} rx={0.8} fill="#B4B9BE" stroke={METAL_DARK} strokeWidth={0.5} />
    <rect x={-9.4} y={-7.8} width={19.6} height={15.6} rx={1.6} fill={BLACK} stroke="#0E0E0E" strokeWidth={0.6} />
    <rect x={-7.8} y={-6.4} width={16.4} height={1.3} rx={0.65} fill="white" opacity={0.16} />
    <Print x={0.4} y={2.2} size={5.4} fill="#C8C8C8">OUT</Print>
  </g>
);

export const jackArt: Art = (params) => (
  <g transform="translate(2.5 0)">
    <rect x={10} y={-5} width={5.4} height={1.9} rx={0.5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.4} />
    <rect x={10} y={3.1} width={5.4} height={1.9} rx={0.5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.4} />
    {jackBody(params)}
  </g>
);

/** A push button from above: a square metal frame with a round red cap, darker while it is held. 16 × 16. */
export const pushButtonBody: Art = (params) => {
  const held = Number(params.closed) >= 1;
  return (
    <g>
      <rect x={-8} y={-8} width={16} height={16} rx={1.8} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
      <rect x={-6.6} y={-6.8} width={13.2} height={1.2} rx={0.6} fill="white" opacity={0.6} />
      <rect x={-6.8} y={5.2} width={13.6} height={1.6} rx={0.8} fill="black" opacity={0.14} />
      {[[-6, -6], [6, -6], [-6, 6], [6, 6]].map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r={0.8} fill={METAL_DARK} />)}
      <circle cx={0} cy={0} r={5.6} fill="#8E1226" />
      <circle cx={0} cy={held ? 0 : -0.6} r={held ? 4.4 : 4.8} fill={held ? '#B0152F' : '#F0314F'} />
      {!held && <path d="M-3.2,-2.2 A3.6,3.6 0 0 1 -0.4,-4" fill="none" stroke="white" strokeWidth={1.1} strokeLinecap="round" opacity={0.7} />}
    </g>
  );
};

export const pushButtonArt: Art = (params) => (
  <g>
    <Lead x1={-23} x2={-8} y={0} />
    <Lead x1={8} x2={23} y={0} />
    {pushButtonBody(params)}
  </g>
);

/** A light-dependent resistor from the front: a pale disc with its zigzag of cadmium sulphide. 19 across. */
export const ldrBody: Art = () => (
  <g>
    <circle cx={0} cy={0} r={9.6} fill="#EFE3C2" stroke="#A8966A" strokeWidth={0.6} />
    <path d="M-5.2,-5.6 H5.2 V-3.4 H-5.2 V-1.1 H5.2 V1.1 H-5.2 V3.4 H5.2 V5.6 H-5.2" fill="none" stroke="#C8452C" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
    <path d="M-7.4,-3.4 A8,8 0 0 1 -2.4,-7.8" fill="none" stroke="white" strokeWidth={1.2} strokeLinecap="round" opacity={0.75} />
    <path d="M-4.6,6.6 A8,8 0 0 0 7.2,3.4" fill="none" stroke="black" strokeWidth={1.3} strokeLinecap="round" opacity={0.12} />
  </g>
);

export const ldrArt: Art = (params) => (
  <g>
    <Lead x1={-4.5} x2={21.5} y={-3} />
    <Lead x1={-4.5} x2={21.5} y={3} />
    <g transform="translate(-10.5 0)">{ldrBody(params)}</g>
  </g>
);

/** Body contacts: two brass plates a finger's width apart, a pink fingertip across them while they are touched. 23 × 15. */
export const touchPadsBody: Art = (params) => {
  const touched = Number(params.touch) > 0;
  return (
    <g>
      {[-11.5, 1.5].map((x) => (
        <g key={x}>
          <rect x={x} y={-7.5} width={10} height={15} rx={2.4} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.6} />
          <rect x={x + 1.6} y={-6.2} width={6.8} height={1.2} rx={0.6} fill="white" opacity={0.55} />
          <rect x={x + 1.4} y={4.4} width={7.2} height={1.8} rx={0.9} fill="black" opacity={0.14} />
        </g>
      ))}
      {touched && <ellipse cx={0} cy={0} rx={7.5} ry={5.6} fill="#FF2D55" opacity={0.3 + 0.5 * Math.min(1, Number(params.touch))} />}
    </g>
  );
};

export const touchPadsArt: Art = (params) => (
  <g>
    <Lead x1={-23} x2={-11} y={0} />
    <Lead x1={11} x2={23} y={0} />
    {touchPadsBody(params)}
  </g>
);

/** A small loudspeaker from the front: pressed-steel frame, paper cone, dust cap. 23 across. */
export const speakerBody: Art = () => (
  <g>
    <circle cx={0} cy={0} r={11.5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
    <path d="M-9,-4.4 A10,10 0 0 1 -3,-9.6" fill="none" stroke="white" strokeWidth={1.1} strokeLinecap="round" opacity={0.8} />
    {[45, 135, 225, 315].map((a) => (
      <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 10} cy={Math.sin((a * Math.PI) / 180) * 10} r={0.8} fill="#5E6368" />
    ))}
    <circle cx={0} cy={0} r={8.8} fill={BLACK} />
    <circle cx={0} cy={0} r={7.4} fill="#4A4A4A" />
    <circle cx={0} cy={0} r={5.6} fill="none" stroke="#3A3A3A" strokeWidth={0.8} />
    <path d="M-5.6,-3 A6.4,6.4 0 0 1 -1.4,-6.2" fill="none" stroke="white" strokeWidth={1} strokeLinecap="round" opacity={0.25} />
    <circle cx={0} cy={0} r={3} fill="#1E1E1E" />
    <circle cx={-0.9} cy={-1} r={0.8} fill="white" opacity={0.35} />
  </g>
);

export const speakerArt: Art = (params) => (
  <g transform="translate(-2 0)">
    <rect x={11} y={-4.4} width={5.6} height={2.2} rx={0.5} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.4} />
    <rect x={11} y={2.2} width={5.6} height={2.2} rx={0.5} fill={BRASS} stroke={BRASS_DARK} strokeWidth={0.4} />
    {speakerBody(params)}
  </g>
);

/** A blob of solder, 10 across. */
export const solderBlob: Art = () => (
  <g>
    <circle cx={0} cy={0} r={5} fill={METAL} stroke={METAL_DARK} strokeWidth={0.6} />
    <ellipse cx={-1.5} cy={-1.8} rx={2} ry={1.2} fill="white" opacity={0.8} transform="rotate(-30 -1.5 -1.8)" />
    <path d="M-2.6,3.2 A4,4 0 0 0 3.6,1.6" fill="none" stroke="black" strokeWidth={1} strokeLinecap="round" opacity={0.16} />
  </g>
);

/** A junction: a blob of solder where wires meet. */
export const junctionArt: Art = (params) => (
  <g>
    <line x1={-17} y1={0} x2={17} y2={0} stroke="#333" strokeWidth={1.6} strokeLinecap="round" />
    <line x1={0} y1={-10.5} x2={0} y2={10.5} stroke="#333" strokeWidth={1.6} strokeLinecap="round" />
    {solderBlob(params)}
  </g>
);
