import { memo, useCallback } from 'react';
import type { NodeProps } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import type { CircuitNodeData } from '../useCircuitSync';
import { NodeFrame } from './NodeFrame';

/** The parameter a click on a switch flips: the one its toggle on the cover sets (`closed`, or a changeover's `throw`). */
export function toggleParameter(type: string): string {
  const cover = ComponentRegistry.getInstance().get(type)?.cover;
  const toggle = (Array.isArray(cover) ? cover : cover ? [cover] : []).find((c) => c.control === 'toggle');
  return toggle?.parameter ?? 'closed';
}

export const SwitchNode = memo(function SwitchNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const parameter = toggleParameter(component.type);
    const on = Number(component.parameters[parameter]) >= 1;
    // The audio engine picks the change up from the circuit and sends it to
    // the running simulation as a live parameter update
    updateComponent(component.id, { parameters: { ...component.parameters, [parameter]: on ? 0 : 1 } });
  }, [component, updateComponent]);

  return (
    <NodeFrame component={component} viewMode={viewMode} selected={selected}
      cursor="pointer" onSymbolClick={handleClick} />
  );
});
