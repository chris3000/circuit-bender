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
  /** Name shown next to the part ("WACKY", "CUTOFF"). Has no effect on the simulation. */
  label?: string;
  parameters: ComponentParameters;
  pins: Pin[];
  state: ComponentState;
}

export interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId;
  /** A color the user gave this wire (an id from WIRE_COLORS); none means the default for its kind. */
  color?: string;
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

/** How far a symbol draws beyond its dimensions box (value text and the like), in px. */
export interface SymbolOverhang {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface ComponentView {
  symbol: SVGSymbol;
  dimensions: { width: number; height: number };
  /** Wires and name labels keep clear of this as well as of the dimensions box. */
  overhang?: SymbolOverhang;
}

/** The one number a part is known by (a resistor's resistance), for parts that have one. */
export interface ComponentValue {
  /** The parameter that holds it. */
  parameter: string;
  kind: 'resistance' | 'capacitance';
  /** What the number is called, and an example of how it is typed. */
  label: string;
  example: string;
}

/** How a part appears on the parts shelf. All of it is optional: a part with none still gets a place. */
export interface ComponentShelf {
  /** The part's name on the shelf, when shorter than its full name. */
  title?: string;
  /** A few words under the title saying what it is. */
  caption?: string;
  /** Other words people look for it by. */
  keywords?: string[];
  /**
   * The part as it looks in the hand, drawn in a 48 × 24 box centred on the
   * origin. Without one the board symbol is shown.
   */
  art?: (params: ComponentParameters) => React.ReactNode;
  /** For a part with a `value`: the values kept in stock (any other can be had by typing it), */
  stock?: number[];
  /** and the ones common enough to show before the rest. */
  common?: number[];
}

/**
 * How a part shows on the cover (the front panel of the finished thing).
 * Parts without this stay inside the box.
 */
export interface ComponentCover {
  /** Knobs and toggles are inputs; lamps, jacks and the pilot light are outputs. */
  control: 'knob' | 'toggle' | 'lamp' | 'jack' | 'pilot';
  /** The live parameter a knob (0 to 1) or a toggle (0 or 1) sets. */
  parameter?: string;
  /** What it is called on the panel until the part is given a name: "KNOB". */
  name: string;
  /** Small print beside it, e.g. the supply voltage. */
  detail?: (parameters: ComponentParameters) => string;
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
  value?: ComponentValue;
  shelf?: ComponentShelf;
  cover?: ComponentCover;
  schematic: ComponentView;
  board: ComponentView;
  controlPanel?: (component: Component) => React.ReactNode;
}
