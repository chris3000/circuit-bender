/**
 * The schematic symbol of a chip that is drawn as a box: its pins down the
 * left and right sides and along the top, each with its name beside it, the
 * part number underneath.
 */
import type { ReactNode } from 'react';
import type { PinDefinition } from '@/types/circuit';
import { generatePinId } from '@/utils/ids';
import { chipBoard, chipLegs } from './boardArt';

const FONT = "'Courier New', Courier, monospace";
/** How far inside the box's outline its pins sit. */
const INSET = 5;
/** Room under the box for the part number. */
export const CHIP_NAME_ROOM = 14;

export interface ChipPin {
  label: string;
  type: PinDefinition['type'];
  x: number;
  y: number;
}

/** Pins in the order the simulation model has them. */
export function chipPins(type: string, pins: ChipPin[]): PinDefinition[] {
  return pins.map((pin, index) => ({
    id: generatePinId(type, index), label: pin.label, type: pin.type, position: { x: pin.x, y: pin.y },
  }));
}

/** `count` pins down one side, 20 apart, starting at `top`. */
export function column(x: number, top: number, labels: string[], type: PinDefinition['type']): ChipPin[] {
  return labels.map((label, i) => ({ label, type, x, y: top + i * 20 }));
}

/** The box, for a part `width` × `height` whose top pins are at `-height / 2 + 10`. */
export function chipSymbol(options: { width: number; height: number; name: string; pins: PinDefinition[] }): () => ReactNode {
  const { width, height, name, pins } = options;
  const left = -width / 2 + INSET, top = -height / 2 + INSET;
  const topRow = -height / 2 + 10;
  return () => (
    <g>
      <rect x={left} y={top} width={width - 2 * INSET} height={height - 2 * INSET} stroke="currentColor" strokeWidth="2" fill="none" />
      <path d={`M -8,${top} Q 0,${top + 9} 8,${top}`} stroke="currentColor" strokeWidth="1.5" fill="none" />
      {pins.map((pin) => {
        const { x, y } = pin.position;
        const onTop = y <= topRow;
        return (
          <text key={pin.id} fontSize="7" fontFamily={FONT} fill="currentColor"
            x={onTop ? x : x < 0 ? x + 8 : x - 8} y={onTop ? y + 14 : y + 2.5}
            textAnchor={onTop ? 'middle' : x < 0 ? 'start' : 'end'}>
            {pin.label}
          </text>
        );
      })}
      <text x="0" y={height / 2 + 10} textAnchor="middle" fontSize="10" fontFamily={FONT} fill="currentColor">{name}</text>
    </g>
  );
}

/**
 * Both views of a boxed chip from its pins: the schematic box and the DIP
 * package on the board, the same size, a leg to each pin.
 */
export function chipViews(options: { width: number; height: number; name: string; lines: string[]; pins: PinDefinition[] }) {
  const { width, height, name, lines, pins } = options;
  const topRow = -height / 2 + 10;
  return {
    schematic: {
      symbol: { width, height, render: chipSymbol({ width, height, name, pins }) },
      dimensions: { width, height },
      overhang: { bottom: CHIP_NAME_ROOM },
    },
    board: {
      symbol: {
        width, height,
        render: chipBoard({
          left: -width / 2 + 16, top: topRow + 6, width: width - 32, height: height - 28,
          marking: name, lines, legs: chipLegs(pins, topRow),
        }),
      },
      dimensions: { width, height },
    },
  };
}
