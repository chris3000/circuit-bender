import React from 'react';
import type { ComponentDefinition } from '@/types/circuit';

interface ComponentSymbolProps {
  definition: ComponentDefinition;
  width?: number;
  height?: number;
  testId?: string;
}

export const ComponentSymbol = React.memo(function ComponentSymbol({
  definition,
  width = 60,
  height = 60,
  testId,
}: ComponentSymbolProps) {
  const { symbol } = definition.schematic;

  return (
    <svg
      data-testid={testId}
      width={width}
      height={height}
      viewBox={`${-symbol.width / 2} ${-symbol.height / 2} ${symbol.width} ${symbol.height}`}
    >
      {symbol.render(definition.defaultParameters)}
    </svg>
  );
});
