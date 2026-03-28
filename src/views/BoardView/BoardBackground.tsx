import React from 'react';

export const BoardBackground = React.memo(function BoardBackground() {
  return (
    <g data-testid="board-background">
      <defs>
        <pattern id="pcbTexture" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#1a6b3c" />
          <rect width="1" height="1" x="1" y="1" fill="#1d7042" opacity="0.25" />
          <rect width="1" height="1" x="4" y="4" fill="#176634" opacity="0.25" />
        </pattern>
        <radialGradient id="padGradient">
          <stop offset="0%" stopColor="#e8c870" />
          <stop offset="60%" stopColor="#d4aa50" />
          <stop offset="100%" stopColor="#a08030" />
        </radialGradient>
        <radialGradient id="ledGlow">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#ff2d55" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#1a6b3c" />
      <rect width="100%" height="100%" fill="url(#pcbTexture)" />
    </g>
  );
});
