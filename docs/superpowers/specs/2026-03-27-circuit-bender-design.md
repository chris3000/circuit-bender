# Circuit Bender - Design Specification

**Date:** 2026-03-27
**Status:** Approved
**Version:** 1.0

## Overview

Circuit Bender is a web application for emulating electronic circuits with a focus on analog synthesizer circuits. It provides two synchronized views—a precise schematic view and a skeumorphic breadboard view—allowing users to build, simulate, and hear circuits in real-time.

**Target Audience:**
- Electronics hobbyists and students learning circuit basics
- Musicians and sound designers experimenting with synth circuits
- Circuit designers prototyping before building physical circuits
- Educators teaching electronics and synthesis

**Core Goals:**
- Real-time audio and visual simulation
- Dual-view interface (schematic and breadboard) kept in sync
- Extensible component library starting with analog synth components
- Intuitive drag-drop interface for building circuits
- Design for future expansion (cloud storage, collaboration, mobile)

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │ Schematic View (SVG) │  │ Breadboard View      │         │
│  │                      │  │ (Canvas)             │         │
│  └──────────────────────┘  └──────────────────────┘         │
│              ↕ Synchronized through Circuit Model            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Circuit Model (Unified State)                   │
│  Components | Connections | Simulation State                │
└─────────────────────────────────────────────────────────────┘
                    ↓                    ↓
┌──────────────────────────┐  ┌──────────────────────────────┐
│   Simulation Engine      │  │   Audio Engine               │
│   (Hybrid Physics)       │  │   (Web Audio API)            │
└──────────────────────────┘  └──────────────────────────────┘
```

**Key Architectural Principles:**

1. **Single Source of Truth**: The Circuit Model is the canonical representation. Views are pure renderings of this model.

2. **Separation of Concerns**: Simulation logic is independent of rendering. Views can be swapped or modified without changing physics.

3. **Extensibility**: Component system uses plugins. New components don't require core code changes.

4. **Real-time First**: All updates propagate immediately. Circuits are always "live" with no explicit run button.

### Technology Stack

- **Framework**: React 18+ with TypeScript
- **Schematic View**: SVG rendering with React components
- **Breadboard View**: HTML Canvas with 2D context
- **Audio**: Web Audio API with AudioWorklet
- **Drag-Drop**: dnd-kit library
- **State Management**: React Context + useReducer (with option for Zustand if needed)
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library
- **Persistence**: localStorage (MVP) → cloud storage (future)

## Data Model

### Core Structures

```typescript
interface Circuit {
  id: string;
  name: string;
  components: Map<ComponentId, Component>;
  connections: Connection[];
  metadata: CircuitMetadata;
}

interface Component {
  id: ComponentId;
  type: string; // "CD40106", "resistor", "capacitor", etc.
  position: {
    schematic: { x: number; y: number };
    breadboard: { row: number; column: number };
  };
  rotation: number; // 0, 90, 180, 270 degrees
  parameters: ComponentParameters; // user-set values
  pins: Pin[];
  state: ComponentState; // runtime simulation data
}

interface Connection {
  id: ConnectionId;
  from: { componentId: ComponentId; pinId: PinId };
  to: { componentId: ComponentId; pinId: PinId };
  net: NetId; // electrical net this wire belongs to
}

interface Pin {
  id: PinId;
  label: string;
  type: "input" | "output" | "bidirectional" | "power" | "ground";
  position: { x: number; y: number }; // relative to component
}

interface ComponentParameters {
  [key: string]: number | string | boolean;
  // Examples:
  // resistance: 1000000 (ohms)
  // capacitance: 0.0000001 (farads)
  // value: "1M" (display value)
}

interface ComponentState {
  voltages: Map<PinId, number>;
  currents: Map<PinId, number>;
  internalState?: any; // component-specific state
}
```

### Design Decisions

**Dual Position System**: Each component stores both schematic (x,y) and breadboard (row,column) positions. This allows views to stay synchronized while using natural coordinate systems for each view.

**Net-Based Wiring**: Connections are organized into electrical nets (groups of electrically connected points). This matches real circuit behavior and simplifies simulation.

**Component Plugin System**: The `type` field references a registered component definition. New components can be added without modifying the core model.

**Separation of Parameters vs State**: `parameters` are user-set values (resistor ohms, capacitor farads). `state` is runtime simulation data (current voltage, etc.). This makes serialization clean.

**Immutable Updates**: Circuit modifications return new circuit instances (React-friendly). Simulation state updates are mutable for performance.

## Component System

### Component Definition

Each component type is defined by a plugin that provides:

```typescript
interface ComponentDefinition {
  type: string;
  metadata: {
    name: string;
    category: "passive" | "active" | "ic" | "power" | "control";
    description: string;
  };

  // Physical characteristics
  pins: PinDefinition[];
  defaultParameters: ComponentParameters;

  // Rendering
  schematic: {
    symbol: SVGSymbol;
    dimensions: { width: number; height: number };
  };
  breadboard: {
    renderer: (ctx: CanvasRenderingContext2D, params: ComponentParameters) => void;
    dimensions: { rows: number; columns: number };
  };

  // Simulation behavior
  simulate: (inputs: PinStates, params: ComponentParameters) => PinStates;

  // Optional: For complex components needing custom UI
  controlPanel?: (component: Component) => React.ReactNode;
}
```

### Initial Component Library

Components needed to build the Weird Sound Generator circuit:

**Integrated Circuits:**
- CD40106 - Hex Schmitt Trigger Inverter
- LM741 - Operational Amplifier

**Semiconductors:**
- 2N3904 - NPN Transistor
- 1N914 - Signal Diode

**Passive Components:**
- Resistors (various values: 1kΩ, 10kΩ, 100kΩ, 1MΩ)
- Capacitors - Ceramic (various values)
- Capacitors - Electrolytic (various values)

**Controls:**
- Potentiometers (1MΩ, 100kΩ)
- SPST Switch (optional)

**Power & I/O:**
- Power Supply (+9V, adjustable)
- Ground
- Audio Output Jack

### Component Registry

```typescript
class ComponentRegistry {
  private definitions: Map<string, ComponentDefinition>;

  register(definition: ComponentDefinition): void;
  get(type: string): ComponentDefinition | undefined;
  getByCategory(category: string): ComponentDefinition[];
  search(query: string): ComponentDefinition[];
}
```

The registry is populated at app startup and can be extended dynamically.

## View Rendering

### Schematic View (SVG)

**Rendering Approach:**
- React components render SVG elements
- Each component type has an SVG symbol
- Grid snapping for clean alignment
- Orthogonal wire routing (Manhattan-style)

**Features:**
- Grid with configurable spacing (default 10px)
- Component rotation in 90° increments
- Auto-routing for wires (shortest orthogonal path)
- Net highlighting on hover
- Zoom and pan controls
- Selection and multi-select

**Wire Routing:**
- A* pathfinding for automatic wire routing
- Avoid crossing other components when possible
- User can add manual waypoints for custom routing

### Breadboard View (Canvas)

**Rendering Approach:**
- HTML Canvas 2D rendering
- Realistic textures and shadows
- Component images or procedural drawing
- Physics-based wire curves

**Features:**
- Standard breadboard layout (power rails + main grid)
- Hole-based snapping (components snap to breadboard holes)
- Realistic component appearance (skeumorphic design)
- Wire colors (user-selectable)
- Zoom and pan controls
- Selection highlighting

**Visual Details:**
- Breadboard texture (tan/beige plastic)
- Metal contact holes with depth
- IC pins with realistic metal texture
- Resistor color bands
- Capacitor polarity markings
- Wire shadows and bending

### View Synchronization

Both views render from the same Circuit Model:

1. User places component in schematic → model updates → breadboard re-renders
2. User moves component in breadboard → model updates → schematic re-renders
3. User changes parameter → both views update immediately

Each view maintains its own:
- Pan/zoom state
- Selection state
- Tool mode (wire, select, etc.)

### Component Drawers

Collapsible sidebar showing component library:

**Organization:**
- Search bar at top (fuzzy search across all components)
- Categories: ICs, Passives, Semiconductors, Controls, Power, I/O
- Each category is collapsible
- Component cards show icon, name, and quick description

**Interaction:**
- Drag component from drawer to either view
- Hover shows detailed tooltip (pin configuration, parameters)
- Click for component datasheet (future)

## Simulation Engine

### Hybrid Simulation Approach

The simulation uses different accuracy levels based on component type:

**Accurate Simulation** (for core synthesis components):
- Oscillator ICs (CD40106)
- Op-amps (LM741)
- Critical timing circuits
- Uses detailed component models with realistic behavior

**Simplified Simulation** (for support components):
- Passive components (ideal resistors, capacitors)
- Power supply (perfect voltage source)
- Wiring (zero resistance)

This hybrid approach balances accuracy with performance.

### Simulation Loop

```typescript
class SimulationEngine {
  private timestep: number = 1 / 48000; // Match audio sample rate

  step(circuit: Circuit): void {
    // 1. Build netlist from connections
    const nets = this.buildNets(circuit.connections);

    // 2. For each component, calculate pin states
    for (const component of circuit.components.values()) {
      const inputs = this.getPinStates(component, nets);
      const outputs = this.simulate(component, inputs);
      this.updateComponentState(component, outputs);
    }

    // 3. Update net voltages
    this.updateNets(nets, circuit.components);

    // 4. Push audio output to audio engine
    this.audioEngine.update(this.getAudioNets(circuit));
  }
}
```

**Performance Optimization:**
- Only simulate components connected to active nets
- Use lookup tables for common calculations
- Batch similar components together
- Run simulation in Web Worker (future)

### Pluggable Simulation Modes

Design allows for future simulation modes:

- **Fast Mode**: Maximum simplification for complex circuits
- **Accurate Mode**: Full SPICE-level simulation
- **Hybrid Mode** (default): Balance of accuracy and speed

Each component's `simulate()` function receives a mode parameter and adjusts behavior accordingly.

## Audio Synthesis Engine

### Architecture

```typescript
class AudioEngine {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode;
  private audioSources: Map<NetId, AudioNode>;

  update(simulationState: SimulationState): void {
    // Convert voltage samples to audio samples
    const audioSamples = this.voltageToAudio(simulationState);

    // Send to AudioWorklet
    this.workletNode.port.postMessage(audioSamples);
  }

  private voltageToAudio(state: SimulationState): Float32Array {
    // Map voltage range (e.g., 0-9V) to audio range (-1 to +1)
    // ...
  }
}
```

### Signal Flow

1. Simulation engine calculates node voltages at each timestep
2. Audio engine reads voltages from designated "audio output" nets
3. Converts voltage levels to audio samples (-1 to +1 range)
4. Feeds samples to AudioWorklet for playback

### AudioWorklet Implementation

Use AudioWorkletProcessor to run synthesis in the audio rendering thread:

**Benefits:**
- No audio glitches during UI updates
- Consistent timing
- Better performance

**Communication:**
- Main thread → Worklet: Voltage samples via postMessage
- Use SharedArrayBuffer for high-performance data transfer (when available)

### Sample Rate Synchronization

- Audio runs at 48kHz (or 44.1kHz based on hardware)
- Simulation generates samples at matching rate
- Use linear interpolation if rates don't match exactly

### Audio Output Components

Special "Audio Output Jack" component marks which nets produce sound:

- Can have multiple outputs (stereo, multi-channel)
- Visual waveform scope shows real-time signal
- Volume control and mute button
- Can route to virtual oscilloscope

## User Interactions

### Drag-and-Drop System

**Component Placement:**
- Drag from component drawer → drop on schematic or breadboard
- Schematic: snaps to grid (configurable spacing)
- Breadboard: snaps to hole grid
- Visual preview follows cursor during drag
- Invalid drop zones show visual feedback (red highlight)

**Component Movement:**
- Click and drag placed components to reposition
- Connected wires stretch and update automatically
- Shift+drag to duplicate component
- Delete key or trash button to remove

**Implementation:**
- Use `dnd-kit` library for React
- Custom collision detection for breadboard holes
- Drag overlay shows component preview

### Wiring System

**Creating Wires:**
- Click on component pin → drag → click on another pin
- Visual wire preview during drag
- Schematic: orthogonal routing with auto-routing
- Breadboard: curved wires with physics simulation

**Wire Management:**
- Click wire to select
- Delete selected wire
- Hover shows connected components and net
- Color-coded wires (user-selectable)
- Net highlighting: click a wire → all wires in same net highlight

**Validation:**
- Prevent invalid connections (power to power, etc.)
- Warn on common mistakes (no ground, floating inputs)
- Show voltage conflicts visually

### Interactive Controls

**Potentiometers:**
- Click and drag vertically to adjust value
- Shows current value in tooltip
- Updates simulation in real-time
- Double-click to type exact value

**Switches:**
- Click to toggle position
- Immediate simulation update

**Oscilloscope Probes:**
- Drag virtual probe to any net
- Shows real-time waveform in scope panel
- Multiple channels with different colors
- Time/voltage scaling controls

### Keyboard Shortcuts

- `Space` - Pan mode (hold and drag)
- `W` - Wire mode
- `Esc` - Cancel current operation
- `Del` - Delete selection
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` - Redo
- `Ctrl/Cmd + S` - Save circuit
- `Tab` - Switch between schematic and breadboard views
- `Ctrl/Cmd + D` - Duplicate selection
- `R` - Rotate selected component

## Persistence & Data Management

### Phase 1: localStorage (MVP)

```typescript
interface StorageManager {
  saveCircuit(circuit: Circuit): void;
  loadCircuit(id: string): Circuit | null;
  listCircuits(): CircuitMetadata[];
  deleteCircuit(id: string): void;
  autoSave(circuit: Circuit): void;
}
```

**Features:**
- Auto-save every 30 seconds when changes detected
- "Unsaved changes" warning on page close
- Visual indicator shows save status
- Circuit list with thumbnails and metadata

**Circuit Serialization:**
- JSON format for human readability
- Compress using LZ-string to reduce storage size
- Include version number for future migrations
- Store component library version for compatibility

### File Format

```json
{
  "version": "1.0",
  "circuit": {
    "id": "abc123",
    "name": "Weird Sound Generator",
    "components": [
      {
        "id": "comp1",
        "type": "CD40106",
        "position": {
          "schematic": { "x": 100, "y": 200 },
          "breadboard": { "row": 5, "column": 10 }
        },
        "rotation": 0,
        "parameters": {}
      }
    ],
    "connections": [
      {
        "id": "conn1",
        "from": { "componentId": "comp1", "pinId": "pin1" },
        "to": { "componentId": "comp2", "pinId": "pin3" },
        "net": "net1"
      }
    ],
    "metadata": {
      "created": "2026-03-27T12:00:00Z",
      "modified": "2026-03-27T12:30:00Z",
      "componentLibraryVersion": "1.0",
      "thumbnail": "data:image/png;base64,..."
    }
  }
}
```

### Export Options (MVP)

- Download circuit as JSON file
- Export netlist (text format describing connections)
- Future: Export as PNG/SVG image of schematic

### Phase 2: Cloud Storage (Future)

**Features:**
- User accounts with authentication (OAuth)
- Save circuits to cloud
- Share circuits via URL (read-only or editable links)
- Version history and snapshots
- Collaboration (multiple users editing)
- Import from common formats (SPICE netlists, KiCad, etc.)

**Migration Path:**
- Design API schema now
- localStorage format compatible with cloud format
- Easy migration: upload existing circuits to cloud

## Testing Strategy

### Unit Tests

**Coverage:**
- Component simulation logic (each component's `simulate()` function)
- Circuit model operations (add/remove components, connections)
- Net analysis algorithms
- Data serialization/deserialization
- Storage operations

**Example:**
```typescript
describe('Resistor', () => {
  it('should follow Ohms law', () => {
    const resistor = new Resistor({ resistance: 1000 });
    const output = resistor.simulate({ voltage: 5, current: 0 });
    expect(output.current).toBeCloseTo(0.005); // I = V/R
  });
});
```

### Integration Tests

**Coverage:**
- View synchronization (schematic ↔ breadboard)
- Audio engine integration
- Drag-drop interactions
- Wire routing
- Undo/redo system

### Circuit Validation Tests

**Coverage:**
- Build known circuits programmatically
- Verify expected behavior (e.g., oscillator produces signal)
- Regression tests for simulation accuracy
- Performance benchmarks

**Example:**
```typescript
describe('WSG Circuit', () => {
  it('should generate square wave', () => {
    const circuit = buildWSGCircuit();
    const engine = new SimulationEngine(circuit);
    engine.run(1000); // 1000 samples
    const output = engine.getNetVoltage('audioOut');
    expect(isSquareWave(output)).toBe(true);
  });
});
```

### Visual Regression Tests

**Coverage:**
- Canvas rendering correctness
- SVG schematic symbols
- Component appearance consistency
- Future: Playwright for full UI testing

### Audio Tests

**Coverage:**
- Waveform generation accuracy
- Audio glitch detection
- Sample rate synchronization
- Frequency/amplitude validation

**Implementation:**
- Mock Web Audio API for testing without actual playback
- Analyze generated audio buffers
- Compare against expected waveforms

### Testing Tools

- **Vitest** - Unit and integration tests (fast, modern, Vite-native)
- **React Testing Library** - Component testing
- **Playwright** - E2E testing (future)
- **Custom mocks** - Web Audio API, Canvas rendering

### Coverage Goals

- Core simulation engine: **90%+**
- Circuit model: **90%+**
- UI components: **70%+**
- Overall project: **80%+**

## Implementation Phases

### Phase 1: Foundation (MVP)

**Goals:**
- Basic schematic view with component placement
- Simple breadboard view
- Initial component library (WSG components)
- Basic simulation (no audio yet)
- localStorage persistence

**Deliverables:**
- Users can build the WSG circuit in both views
- Components connect with wires
- Circuit state is saved/loaded

### Phase 2: Audio & Simulation

**Goals:**
- Real-time audio synthesis
- Complete simulation engine
- Oscilloscope/waveform viewer
- Interactive controls (pots, switches)

**Deliverables:**
- WSG circuit produces sound
- Users can hear and see waveforms
- Adjust parameters in real-time

### Phase 3: Polish & Expand

**Goals:**
- Expanded component library
- Better UI/UX (animations, feedback)
- Export/import circuits
- Improved breadboard realism

**Deliverables:**
- 30-40 components available
- Professional, polished interface
- Users can share circuits

### Phase 4: Cloud & Collaboration (Future)

**Goals:**
- User accounts
- Cloud storage
- Circuit sharing
- Collaboration features
- Mobile/tablet support

## Open Questions & Future Considerations

### Multi-component Selection
- How should bulk operations work?
- Copy/paste multiple components with connections?

### Circuit Debugging
- Visual voltage indicators?
- Step-through simulation?
- Breakpoints on component state changes?

### Performance Limits
- Maximum circuit size?
- What happens with 100+ components?
- Need Web Worker for simulation?

### Component Library Growth
- How to handle 100s of components in drawer?
- Better search/filtering?
- User-created components?

### Collaboration
- Real-time editing conflicts?
- Who owns shared circuits?
- Versioning strategy?

These questions will be addressed as we build and learn from real usage.

## Success Metrics

**MVP Success:**
- Users can build and simulate the WSG circuit
- Real-time audio works without glitches
- Circuits persist across sessions
- 80%+ test coverage

**Long-term Success:**
- 50+ components in library
- Users share circuits regularly
- Educational institutions adopt the tool
- Active community contributions

---

**End of Specification**