import { memo, useState, useCallback } from 'react';
import type { NodeProps } from 'reactflow';
import { useCircuit } from '@/context/CircuitContext';
import { parseValue, formatValue } from '@/utils/parameterParser';
import type { CircuitNodeData } from '../useCircuitSync';
import { NodeFrame } from './NodeFrame';
import { ValueEditor } from './ValueEditor';

/** A resistor or capacitor: double-click to type a new value. */
export const EditableNode = memo(function EditableNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode } = data;
  const { updateComponent } = useCircuit();
  const [editing, setEditing] = useState(false);
  const paramKey = component.type === 'resistor' ? 'resistance' : 'capacitance';

  const handleDoubleClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setEditing(true); }, []);
  const handleConfirm = useCallback((raw: string) => {
    const parsed = parseValue(raw);
    if (!isNaN(parsed)) {
      const display = formatValue(parsed, paramKey);
      updateComponent(component.id, { parameters: { ...component.parameters, [paramKey]: parsed, value: display } });
    }
    setEditing(false);
  }, [component, paramKey, updateComponent]);
  const handleCancel = useCallback(() => setEditing(false), []);

  return (
    <NodeFrame component={component} viewMode={viewMode} selected={selected} onDoubleClick={handleDoubleClick}>
      {editing && (
        <ValueEditor value={String(component.parameters.value || '')} onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </NodeFrame>
  );
});
