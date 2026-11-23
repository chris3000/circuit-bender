import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { LED_DOME_CENTRE } from '@/components/art/boardArt';
import type { CircuitNodeData } from '../useCircuitSync';
import { rotatePin } from '../routing/layout';
import { NodeFrame } from './NodeFrame';

export const LEDNode = memo(function LEDNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, ledOn } = data;
  // On the board the light comes from the dome, which stands above the pins
  const at = viewMode === 'board' ? rotatePin(0, LED_DOME_CENTRE, component.rotation || 0) : { x: 0, y: 0 };
  const glow = !ledOn ? null : viewMode === 'board' ? (
    // Red light on a green board goes muddy unless it fades out softly
    <>
      <defs>
        <filter id="ledGlowBoard" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <circle cx={at.x} cy={at.y} r="15" fill="#FF4D6D" opacity="0.75" filter="url(#ledGlowBoard)" />
    </>
  ) : (
    <>
      <defs>
        <filter id="ledGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="0" cy="0" r="20" fill="#FF2D55" opacity="0.15" filter="url(#ledGlow)" />
      <circle cx="0" cy="0" r="12" fill="#FF2D55" opacity="0.3" />
    </>
  );
  // ...and the dome itself brightens
  const shine = ledOn && viewMode === 'board' ? (
    <circle cx={at.x} cy={at.y} r="5.5" fill="#FFE1E7" opacity="0.75" pointerEvents="none" />
  ) : null;
  return <NodeFrame component={component} viewMode={viewMode} selected={selected} underlay={glow} overlay={shine} />;
});
