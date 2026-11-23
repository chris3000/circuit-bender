/**
 * The cover itself, without its controls: a dark enamel faceplate between two
 * pink end cheeks, with what makes it look like a made thing — screws, a
 * nameplate, pinstripes, a maker's badge, engraved dividers and vent slots.
 *
 * Drawn the way the parts on the shelf are: flat fills with one highlight and
 * one shadow, no gradients.
 */
import { PANEL, type CoverLayout } from './coverLayout';

export const INK = '#F5F5F5';
export const INK_DIM = '#9A9A9A';
export const PINK = '#FF2D55';
export const METAL = '#C9C9C9';
export const METAL_DARK = '#858585';
export const METAL_LIGHT = '#F2F2F2';
const FACE = '#262626';
const FACE_LIGHT = '#3D3D3D';
const FACE_DARK = '#121212';
const PINK_DARK = '#C81E43';
const PINK_LIGHT = '#FF7A93';
export const FONT = "'Courier New', Courier, monospace";

/** A slotted screw head; `turn` is the angle its slot was left at. */
export function Screw({ x, y, r = 5.5, turn = 0 }: { x: number; y: number; r?: number; turn?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0.8" cy="1.2" r={r} fill="#000" opacity="0.35" />
      <circle r={r} fill={METAL} stroke={METAL_DARK} strokeWidth="1" />
      <path d={`M ${-r * 0.62} ${-r * 0.3} A ${r * 0.7} ${r * 0.7} 0 0 1 ${r * 0.3} ${-r * 0.62}`}
        fill="none" stroke={METAL_LIGHT} strokeWidth="1.2" strokeLinecap="round" />
      <line x1={-r + 1.5} y1="0" x2={r - 1.5} y2="0" stroke="#4A4A4A" strokeWidth="1.6" strokeLinecap="round"
        transform={`rotate(${turn})`} />
    </g>
  );
}

/** A six-sided nut, flat side up. */
export function hexagon(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

/** A line cut into the face: dark, with the far edge catching the light. */
function Engraved({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  const vertical = x1 === x2;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={FACE_DARK} strokeWidth="1.5" />
      <line x1={x1 + (vertical ? 1.25 : 0)} y1={y1 + (vertical ? 0 : 1.25)} x2={x2 + (vertical ? 1.25 : 0)} y2={y2 + (vertical ? 0 : 1.25)}
        stroke={FACE_LIGHT} strokeWidth="1" />
    </g>
  );
}

const BADGE = { width: 124, height: 20 };
const TITLE_SIZE = 17;
const TITLE_SPACING = 3;

/** The circuit's name as it fits on the nameplate. */
export function plateTitle(name: string, room: number): string {
  const title = (name.trim() || 'Untitled').toUpperCase();
  const fits = Math.max(4, Math.floor(room / (TITLE_SIZE * 0.6 + TITLE_SPACING)));
  return title.length <= fits ? title : `${title.slice(0, fits - 1).trimEnd()}…`;
}

interface PanelArtProps {
  layout: CoverLayout;
  name: string;
  /** Small print in the footer, e.g. "44 PARTS INSIDE". */
  footnote: string;
}

export function PanelArt({ layout, name, footnote }: PanelArtProps) {
  const { width, height, face, divider, split } = layout;
  const left = face.left + PANEL.margin, right = face.right - PANEL.margin;
  const stripe = PANEL.header - 20;
  const vents = Array.from({ length: 9 }, (_, i) => right - 4 - i * 9);
  const cheekScrews = [14, height - 14];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, display: 'block' }}
      aria-hidden="true">
      {/* End cheeks: one rounded slab behind the face */}
      <rect x="0" y="0" width={width} height={height} rx="9" fill={PINK} />
      <rect x="6" y="0" width={width - 12} height="2.5" fill={PINK_LIGHT} />
      <rect x="6" y={height - 3} width={width - 12} height="3" fill={PINK_DARK} />
      <rect x={face.left - 3} y="0" width="3" height={height} fill={PINK_DARK} />
      <rect x={face.right} y="0" width="3" height={height} fill={PINK_LIGHT} />
      {cheekScrews.flatMap((y, i) => [
        <Screw key={`l${i}`} x={face.left / 2 - 1} y={y} r={4} turn={i ? 70 : 20} />,
        <Screw key={`r${i}`} x={face.right + face.left / 2 + 1} y={y} r={4} turn={i ? -35 : 110} />,
      ])}

      {/* Faceplate */}
      <rect x={face.left} y="0" width={face.right - face.left} height={height} fill={FACE} />
      <rect x={face.left} y="0" width={face.right - face.left} height="1.5" fill={FACE_LIGHT} />
      <rect x={face.left} y={height - 2} width={face.right - face.left} height="2" fill={FACE_DARK} />
      <Screw x={face.left + 13} y={13} turn={35} />
      <Screw x={face.right - 13} y={13} turn={-20} />
      <Screw x={face.left + 13} y={height - 13} turn={80} />
      <Screw x={face.right - 13} y={height - 13} turn={10} />

      {/* Nameplate, pinstripes and the maker's badge */}
      <text x={left} y="38" fill={INK} fontFamily={FONT} fontSize={TITLE_SIZE} fontWeight="800" letterSpacing={TITLE_SPACING}
        data-testid="cover-title">
        {plateTitle(name, right - left - BADGE.width - 24)}
      </text>
      <rect x={left} y={stripe} width={right - left} height="3" fill={PINK} />
      <rect x={left} y={stripe + 6} width={right - left} height="1" fill={INK} opacity="0.55" />
      <g transform={`translate(${right - BADGE.width} ${38 - 15})`}>
        <rect width={BADGE.width} height={BADGE.height} rx={BADGE.height / 2} fill={PINK} />
        <rect x="8" y="2" width={BADGE.width - 16} height="1.5" rx="0.75" fill={PINK_LIGHT} />
        <text x={BADGE.width / 2} y="13.5" textAnchor="middle" fill="#fff" fontFamily={FONT} fontSize="9.5" fontWeight="800" letterSpacing="1">
          CIRCUIT BENDER
        </text>
      </g>

      {divider !== null && <Engraved x1={left} y1={divider} x2={right} y2={divider} />}
      {split && <Engraved x1={Math.round(split.x)} y1={split.top + 22} x2={Math.round(split.x)} y2={split.bottom - 14} />}

      {/* Footer: small print and vent slots */}
      <Engraved x1={left} y1={height - PANEL.footer + 4} x2={right} y2={height - PANEL.footer + 4} />
      <text x={left} y={height - 14} fill={INK_DIM} fontFamily={FONT} fontSize="8.5" fontWeight="700" letterSpacing="2">
        {footnote}
      </text>
      {vents.map((x) => (
        <g key={x}>
          <rect x={x - 4} y={height - 27} width="4" height="15" rx="2" fill="#0B0B0B" />
          <rect x={x} y={height - 25} width="1" height="11" fill={FACE_LIGHT} />
        </g>
      ))}
    </svg>
  );
}
