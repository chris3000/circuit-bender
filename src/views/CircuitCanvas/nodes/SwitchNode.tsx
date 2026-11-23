import { memo, useCallback } from 'react';
import type { NodeProps } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import type { CircuitNodeData } from '../useCircuitSync';
import { NodeFrame } from './NodeFrame';

export const SwitchNode = memo(function SwitchNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const closed = (component.parameters.closed as number) >= 1;
    // The audio engine picks the change up from the circuit and sends it to
    // the running simulation as a live parameter update
    updateComponent(component.id, { parameters: { ...component.parameters, closed: closed ? 0 : 1 } });
  }, [component, updateComponent]);

  return (
    <NodeFrame component={component} viewMode={viewMode} selected={selected}
      cursor="pointer" onSymbolClick={handleClick} />
  );
});
