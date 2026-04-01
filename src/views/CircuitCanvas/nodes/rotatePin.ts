/** Rotate a pin position by a component's rotation (0, 90, 180, 270 degrees). */
export function rotatePin(
  x: number, y: number, rotation: number
): { x: number; y: number } {
  switch (rotation % 360) {
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
    default: return { x, y };
  }
}

/** Swap width/height for 90° and 270° rotations. */
export function rotateDimensions(
  width: number, height: number, rotation: number
): { width: number; height: number } {
  const r = rotation % 360;
  return (r === 90 || r === 270) ? { width: height, height: width } : { width, height };
}
