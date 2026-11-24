/** What a drag from the parts shelf carries, written and read in one place. */
import type { ComponentParameters } from '@/types/circuit';

const TYPE = 'application/circuit-component';
const PARAMETERS = 'application/circuit-parameters';

// A drag's data cannot be read until it is dropped. What the canvas needs
// while the part is still in the air (to show the wire it would land in) is
// kept here for as long as the drag lasts.
let inTheAir: { type: string; parameters: ComponentParameters } | null = null;

export function writePartDrag(data: DataTransfer, type: string, parameters: ComponentParameters): void {
  data.setData(TYPE, type);
  data.setData(PARAMETERS, JSON.stringify(parameters));
  data.effectAllowed = 'move';
  inTheAir = { type, parameters };
}

/** The drag is over, wherever it ended. */
export function endPartDrag(): void {
  inTheAir = null;
}

/** The part being dragged off the shelf right now, if one is. */
export function partInTheAir(): { type: string; parameters: ComponentParameters } | null {
  return inTheAir;
}

/** The part being dropped, or null if the drag is something else. */
export function readPartDrag(data: DataTransfer): { type: string; parameters: ComponentParameters } | null {
  const type = data.getData(TYPE);
  if (!type) return null;
  const parameters: ComponentParameters = {};
  try {
    const parsed: unknown = JSON.parse(data.getData(PARAMETERS) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') parameters[key] = value;
      }
    }
  } catch { /* a drag with no readable parameters is the plain part */ }
  return { type, parameters };
}
