/** What a drag from the parts shelf carries, written and read in one place. */
import type { ComponentParameters } from '@/types/circuit';

const TYPE = 'application/circuit-component';
const PARAMETERS = 'application/circuit-parameters';

export function writePartDrag(data: DataTransfer, type: string, parameters: ComponentParameters): void {
  data.setData(TYPE, type);
  data.setData(PARAMETERS, JSON.stringify(parameters));
  data.effectAllowed = 'move';
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
