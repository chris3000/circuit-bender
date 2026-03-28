export function getWireColor(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): string {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return '#e04040';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return '#333';
  }
  return '#4a82c4';
}

export function getWireType(
  fromComponentType: string,
  fromPinType: string,
  toComponentType: string,
  toPinType: string,
): 'power' | 'ground' | 'signal' {
  if (
    fromComponentType === 'power' || toComponentType === 'power' ||
    fromPinType === 'power' || toPinType === 'power'
  ) {
    return 'power';
  }
  if (
    fromComponentType === 'ground' || toComponentType === 'ground' ||
    fromPinType === 'ground' || toPinType === 'ground'
  ) {
    return 'ground';
  }
  return 'signal';
}
