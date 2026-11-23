import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import type { CircuitNodeData } from '../useCircuitSync';
import { NodeFrame } from './NodeFrame';

export const CircuitNode = memo(function CircuitNode({ data, selected }: NodeProps<CircuitNodeData>) {
  return <NodeFrame component={data.component} viewMode={data.viewMode} selected={selected} />;
});
