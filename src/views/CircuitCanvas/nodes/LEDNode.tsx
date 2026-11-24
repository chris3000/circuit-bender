import { memo } from 'react';
import type { NodeProps } from 'reactflow';
import { LED_DOME_CENTRE } from '@/components/art/boardArt';
import type { CircuitNodeData } from '../useCircuitSync';
import { rotatePin } from '../routing/layout';
import { NodeFrame } from './NodeFrame';

/** An LED glows as brightly as the current through it makes it (`light`, 0 to 1). */
export const LEDNode = memo(function LEDNode({ data, selected }: NodeProps<CircuitNodeData>) {
  const { component, viewMode, light } = data;
  // On the board the light comes from the dome, which stands above the pins
  const at = viewMode === 'board' ? rotatePin(0, LED_DOME_CENTRE, component.rotation || 0) : { x: 0, y: 0 };
  const glow = light <= 0 ? null : viewMode === 'board' ? (
    // Red light on a green board goes muddy unless it fades out softly
    <>
      <defs>
        <filter id="ledGlowBoard" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <circle data-testid="led-glow" data-light={light} cx={at.x} cy={at.y} r={8 + 7 * light} fill="#FF4D6D"
        opacity={0.2 + 0.55 * light} filter="url(#ledGlowBoard)" />
    </>
  ) : (
    <>
      <defs>
        <filter id="ledGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* A dim LED is a small pale disc; a bright one is larger, stronger and has a halo */}
      <circle cx="0" cy="0" r={12 + 10 * light} fill="#FF2D55" opacity={0.18 * light} filter="url(#ledGlow)" />
      <circle data-testid="led-glow" data-light={light} cx="0" cy="0" r={9 + 4 * light} fill="#FF2D55" opacity={0.08 + 0.3 * light} />
    </>
  );
  // ...and the dome itself brightens
  const shine = light > 0 && viewMode === 'board' ? (
    <circle cx={at.x} cy={at.y} r="5.5" fill="#FFE1E7" opacity={0.15 + 0.6 * light} pointerEvents="none" />
  ) : null;
  return <NodeFrame component={component} viewMode={viewMode} selected={selected} underlay={glow} overlay={shine} />;
});
