export function getWireColor(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): string {
  // Check pin types first — a ground pin on a power supply should be black, not red
  if (fromPinType === 'ground' || toPinType === 'ground' ||
      fromComponentType === 'ground' || toComponentType === 'ground') {
    return '#333';
  }
  if (fromPinType === 'power' || toPinType === 'power' ||
      fromComponentType === 'power' || toComponentType === 'power') {
    return '#e04040';
  }
  return '#4a82c4';
}

export function getWireType(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): 'power' | 'ground' | 'signal' {
  if (fromPinType === 'ground' || toPinType === 'ground' ||
      fromComponentType === 'ground' || toComponentType === 'ground') {
    return 'ground';
  }
  if (fromPinType === 'power' || toPinType === 'power' ||
      fromComponentType === 'power' || toComponentType === 'power') {
    return 'power';
  }
  return 'signal';
}
