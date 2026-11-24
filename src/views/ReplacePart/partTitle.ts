import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { Component } from '@/types/circuit';
import { formatValue } from '@/utils/parameterParser';

/** What a part is called where it is being swapped: its kind, its value if it has one, and its name if it has one. */
export function partTitle(part: Component): string {
  const definition = ComponentRegistry.getInstance().get(part.type);
  if (!definition) return part.type;
  const value = definition.value ? Number(part.parameters[definition.value.parameter]) : NaN;
  const name = definition.shelf?.title ?? definition.metadata.name;
  const kind = `${name}${value > 0 ? ` ${formatValue(value, definition.value!.kind)}` : ''}`;
  return part.label ? `${part.label} (${kind})` : kind;
}
