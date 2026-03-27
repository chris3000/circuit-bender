import { nanoid } from 'nanoid';
import type { ComponentId, ConnectionId, NetId, PinId } from '@/types/circuit';

export function generateComponentId(): ComponentId {
  return `comp_${nanoid(10)}` as ComponentId;
}

export function generateConnectionId(): ConnectionId {
  return `conn_${nanoid(10)}` as ConnectionId;
}

export function generateNetId(): NetId {
  return `net_${nanoid(10)}` as NetId;
}

export function generatePinId(componentId: string, index: number): PinId {
  return `${componentId}_pin_${index}` as PinId;
}
