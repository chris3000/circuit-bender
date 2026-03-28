// Branded types for type safety
export type ComponentId = string & { __brand: 'ComponentId' };
export type PinId = string & { __brand: 'PinId' };
export type ConnectionId = string & { __brand: 'ConnectionId' };
export type NetId = string & { __brand: 'NetId' };

export interface Position2D {
  x: number;
  y: number;
}

export interface Pin {
  id: PinId;
  label: string;
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground';
  position: Position2D; // Relative to component origin
}

export interface ComponentParameters {
  [key: string]: number | string | boolean;
}

export interface ComponentState {
  voltages: Map<PinId, number>;
  currents: Map<PinId, number>;
  internalState?: unknown;
}

export interface Component {
  id: ComponentId;
  type: string;
  position: Position2D;
  rotation: number; // 0, 90, 180, 270
  parameters: ComponentParameters;
  pins: Pin[];
  state: ComponentState;
}

export interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId;
}

export interface CircuitMetadata {
  created: string;
  modified: string;
  componentLibraryVersion: string;
  thumbnail?: string;
}

export interface Circuit {
  id: string;
  name: string;
  components: Map<ComponentId, Component>;
  connections: Connection[];
  metadata: CircuitMetadata;
}

// Serialized format for JSON - Maps converted to arrays of entries
export interface SerializedCircuit {
  id: string;
  name: string;
  components: [ComponentId, Component][]; // Array of [key, value] pairs
  connections: Connection[];
  metadata: CircuitMetadata;
}

// Component Definition types for the plugin system
export interface PinDefinition {
  id: PinId;
  label: string;
  type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground';
  position: Position2D;
}

export interface SVGSymbol {
  width: number;
  height: number;
  render: (params: ComponentParameters) => React.ReactNode;
}

export interface PinStates {
  [pinId: string]: {
    voltage: number;
    current: number;
  };
}

export interface ComponentDefinition {
  type: string;
  metadata: {
    name: string;
    category: 'passive' | 'active' | 'ic' | 'power' | 'control';
    description: string;
  };
  pins: PinDefinition[];
  defaultParameters: ComponentParameters;
  schematic: {
    symbol: SVGSymbol;
    dimensions: { width: number; height: number };
  };
  board: {
    symbol: SVGSymbol;
    dimensions: { width: number; height: number };
  };
  simulate: (inputs: PinStates, params: ComponentParameters) => PinStates;
  controlPanel?: (component: Component) => React.ReactNode;
}
