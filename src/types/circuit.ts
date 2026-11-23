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
  /**
   * Knobs, toggles, buttons and touch pads are inputs; lamps, the pilot
   * light, jacks and speakers are outputs.
   */
  control: 'knob' | 'toggle' | 'button' | 'pad' | 'lamp' | 'pilot' | 'jack' | 'speaker';
  /**
   * The live parameter an input sets: a knob 0 to 1, a toggle 0 or 1, a
   * button 1 while it is held, a pad 0 to 1 (how hard) while it is touched.
   */
  parameter?: string;
  /** What it is called on the panel until the part is given a name: "KNOB". */
  name: string;
  /**
   * For a second thing a part puts on the cover (the supply's starve knob,
   * beside its light): it is always called `name`, and the part's own name
   * stays with the first.
   */
  fixedName?: boolean;
  /** Small print beside it, e.g. the supply voltage. */
  detail?: (parameters: ComponentParameters) => string;
  /** On the cover only while this says so (the audio output is a speaker or a socket, not both). */
  when?: (parameters: ComponentParameters) => boolean;
}

/**
 * A control a part has on the canvas besides its value: a small knob beside
 * the symbol (the supply's starve, the light on a photocell), or the symbol
 * itself held down (a push button, a finger on the contacts). It sets a live
 * parameter, so using it does not restart the simulation. The inspector
 * offers the same control.
 */
export interface ComponentControl {
  kind: 'dial' | 'hold';
  /** The live parameter: 0 to 1 for a dial; 0, or `held` while held, for a hold. */
  parameter: string;
  /** What it is called in the inspector and in tooltips: "Starve". */
  name: string;
  /** A dial: where its knob sits, from the part's centre (before rotation), and what is printed under it. */
  at?: Position2D;
  print?: string;
  /** A dial: where it is until it is turned. */
  rest?: number;
  /**
   * A hold: the value while held. 1 (the default) is a button, down or up.
   * Less is a touch, which dragging up and down while holding makes firmer
   * or lighter.
   */
  held?: number;
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
  /** One thing on the cover, or several. */
  cover?: ComponentCover | ComponentCover[];
  control?: ComponentControl;
  /**
   * A leg with nothing wired to it is not connected to anything inside the
   * part either, as far as the simulation goes (logic chips, whose model sets
   * `ignoresUnconnectedPins`): a bend cannot reach it.
   */
  floatingPins?: boolean;
  schematic: ComponentView;
  board: ComponentView;
  controlPanel?: (component: Component) => React.ReactNode;
}
