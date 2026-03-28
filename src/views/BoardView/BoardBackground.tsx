import React from 'react';

const BOARD_X = 60;
const BOARD_Y = 20;
const BOARD_W = 880;
const BOARD_H = 620;
const BOARD_R = 8;
const HOLE_R = 5;
const HOLE_INSET = 18;

export const BoardBackground = React.memo(function BoardBackground() {
  return (
    <g data-testid="board-background">
      <defs>
        <pattern id="pcbCrosshatch" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#1a6b3c" />
          <line x1="0" y1="0" x2="8" y2="8" stroke="#1d7042" strokeWidth="0.3" opacity="0.4" />
          <line x1="8" y1="0" x2="0" y2="8" stroke="#176634" strokeWidth="0.3" opacity="0.3" />
        </pattern>
        <pattern id="pcbDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.4" fill="#2a8050" opacity="0.4" />
        </pattern>
        <radialGradient id="padGradient">
          <stop offset="0%" stopColor="#e8c870" />
          <stop offset="60%" stopColor="#d4aa50" />
          <stop offset="100%" stopColor="#a08030" />
        </radialGradient>
        <radialGradient id="solderGradient">
          <stop offset="0%" stopColor="#e8e8e8" />
          <stop offset="40%" stopColor="#c0c0c0" />
          <stop offset="100%" stopColor="#909090" />
        </radialGradient>
        <radialGradient id="ledGlow">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.7" />
          <stop offset="30%" stopColor="#ff2d55" stopOpacity="0.3" />
          <stop offset="70%" stopColor="#ff2d55" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
        <filter id="componentShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3" />
        </filter>
        <filter id="boardShadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="3" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.4" />
        </filter>
        <radialGradient id="mountingHole">
          <stop offset="0%" stopColor="#1a1a1a" />
          <stop offset="70%" stopColor="#333" />
          <stop offset="100%" stopColor="#555" />
        </radialGradient>
        <filter id="hoverGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#FF2D55" floodOpacity="0.15" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="100%" height="100%" fill="#111" />

      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="#1a6b3c"
        filter="url(#boardShadow)"
      />
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="url(#pcbCrosshatch)"
      />
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="url(#pcbDots)"
      />
      <rect
        x={BOARD_X} y={BOARD_Y}
        width={BOARD_W} height={BOARD_H}
        rx={BOARD_R}
        fill="none"
        stroke="#145530"
        strokeWidth="2"
      />

      {[
        [BOARD_X + HOLE_INSET, BOARD_Y + HOLE_INSET],
        [BOARD_X + BOARD_W - HOLE_INSET, BOARD_Y + HOLE_INSET],
        [BOARD_X + HOLE_INSET, BOARD_Y + BOARD_H - HOLE_INSET],
        [BOARD_X + BOARD_W - HOLE_INSET, BOARD_Y + BOARD_H - HOLE_INSET],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={HOLE_R + 2} fill="#b8943e" opacity="0.4" />
          <circle cx={cx} cy={cy} r={HOLE_R} fill="url(#mountingHole)" />
          <circle cx={cx} cy={cy} r={HOLE_R} fill="none" stroke="#555" strokeWidth="0.5" />
        </g>
      ))}

      <text
        x={BOARD_X + BOARD_W / 2}
        y={BOARD_Y + 14}
        textAnchor="middle"
        fill="#d4ecd4"
        fontFamily="Courier New"
        fontSize="7"
        opacity="0.4"
      >
        CIRCUIT BENDER v1.0
      </text>
    </g>
  );
});
