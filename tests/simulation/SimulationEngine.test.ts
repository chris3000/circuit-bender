import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SimulationEngine } from '@/simulation/SimulationEngine';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { Circuit } from '@/models/Circuit';
import type {
  ComponentId,
  PinId,
  ConnectionId,
  NetId,
  Component,
  Connection,
  ComponentDefinition,
  PinStates,
  ComponentParameters,
} from '@/types/circuit';

// --- helpers ---

const makeComponent = (
  id: string,
  type: string,
  params: ComponentParameters = {},
  pins: { id: string; label: string; type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground' }[] = []
): Component => ({
  id: id as ComponentId,
  type,
  position: { schematic: { x: 0, y: 0 }, breadboard: { row: 0, column: 0 } },
  rotation: 0,
  parameters: params,
  pins: pins.map((p) => ({
    id: p.id as PinId,
    label: p.label,
    type: p.type,
    position: { x: 0, y: 0 },
  })),
  state: { voltages: new Map(), currents: new Map() },
});

const makeConnection = (
  fromComp: string,
  fromPin: string,
  toComp: string,
  toPin: string,
  id: string = `conn_${fromComp}_${toComp}`
): Connection => ({
  id: id as ConnectionId,
  from: { componentId: fromComp as ComponentId, pinId: fromPin as PinId },
  to: { componentId: toComp as ComponentId, pinId: toPin as PinId },
  net: `net_${id}` as NetId,
});

const makeDef = (
  type: string,
  simulateFn: (inputs: PinStates, params: ComponentParameters) => PinStates,
  pins: { id: string; label: string; type: 'input' | 'output' | 'bidirectional' | 'power' | 'ground' }[] = []
): ComponentDefinition => ({
  type,
  metadata: { name: type, category: 'passive', description: type },
  pins: pins.map((p) => ({
    id: p.id as PinId,
    label: p.label,
    type: p.type,
    position: { x: 0, y: 0 },
  })),
  defaultParameters: {},
  schematic: {
    symbol: { width: 10, height: 10, render: () => null },
    dimensions: { width: 10, height: 10 },
  },
  breadboard: {
    renderer: () => {},
    dimensions: { rows: 1, columns: 1 },
  },
  simulate: simulateFn,
});

// --- test suite ---

describe('SimulationEngine', () => {
  let registry: ComponentRegistry;

  beforeEach(() => {
    registry = ComponentRegistry.getInstance();
    registry.clear();

    // Register a power-supply definition
    registry.register(
      makeDef(
        'power-supply',
        (inputs, params) => ({
          vcc: { voltage: (params.voltage as number) ?? 9, current: 0 },
        }),
        [{ id: 'vcc', label: 'VCC', type: 'power' }]
      )
    );

    // Register a ground definition
    registry.register(
      makeDef(
        'ground',
        () => ({ gnd: { voltage: 0, current: 0 } }),
        [{ id: 'gnd', label: 'GND', type: 'ground' }]
      )
    );

    // Register a test-output definition (counts as output component)
    registry.register(
      makeDef(
        'test-output',
        (inputs) => inputs,
        [{ id: 'in', label: 'IN', type: 'input' }]
      )
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should start inactive', () => {
    const circuit = new Circuit('test');
    const engine = new SimulationEngine(circuit);
    expect(engine.isActive()).toBe(false);
  });

  it('should remain inactive with no output components', () => {
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 9 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const gnd = makeComponent('gnd1', 'ground', {}, [
      { id: 'gnd', label: 'GND', type: 'ground' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(gnd);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'gnd1', 'gnd'));

    const engine = new SimulationEngine(circuit);
    engine.evaluate();
    expect(engine.isActive()).toBe(false);
  });

  it('should activate when an output component is connected to a net', () => {
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 9 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const output = makeComponent('out1', 'test-output', {}, [
      { id: 'in', label: 'IN', type: 'input' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(output);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'out1', 'in'));

    const engine = new SimulationEngine(circuit);
    engine.evaluate();
    expect(engine.isActive()).toBe(true);
  });

  it('should deactivate when the output component is removed', () => {
    // First activate
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 9 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const output = makeComponent('out1', 'test-output', {}, [
      { id: 'in', label: 'IN', type: 'input' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(output);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'out1', 'in'));

    const engine = new SimulationEngine(circuit);
    engine.evaluate();
    expect(engine.isActive()).toBe(true);

    // Remove output, update circuit
    const circuit2 = circuit.removeComponent('out1' as ComponentId);
    engine.setCircuit(circuit2);
    engine.evaluate();
    expect(engine.isActive()).toBe(false);
  });

  it('should compute net voltages from a power supply', () => {
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 9 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const output = makeComponent('out1', 'test-output', {}, [
      { id: 'in', label: 'IN', type: 'input' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(output);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'out1', 'in'));

    const engine = new SimulationEngine(circuit);
    engine.evaluate();

    const voltages = engine.getNetVoltages();
    // The net connecting ps1:vcc to out1:in should have voltage 9
    expect(voltages.size).toBeGreaterThan(0);
    const netVoltageValues = Array.from(voltages.values());
    expect(netVoltageValues).toContain(9);
  });

  it('should expose probeSample for a component pin', () => {
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 5 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const output = makeComponent('out1', 'test-output', {}, [
      { id: 'in', label: 'IN', type: 'input' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(output);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'out1', 'in'));

    const engine = new SimulationEngine(circuit);
    engine.evaluate();

    const sample = engine.probeSample('out1' as ComponentId, 'in' as PinId);
    expect(sample).toBe(5);
  });

  it('should return supply voltage from circuit', () => {
    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 12 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    circuit = circuit.addComponent(ps);

    const engine = new SimulationEngine(circuit);
    expect(engine.getSupplyVoltage()).toBe(12);
  });

  it('should support registerOutputType', () => {
    SimulationEngine.registerOutputType('custom-speaker');

    let circuit = new Circuit('test');
    const ps = makeComponent('ps1', 'power-supply', { voltage: 9 }, [
      { id: 'vcc', label: 'VCC', type: 'power' },
    ]);
    const speaker = makeComponent('spk1', 'custom-speaker', {}, [
      { id: 'in', label: 'IN', type: 'input' },
    ]);
    circuit = circuit.addComponent(ps).addComponent(speaker);
    circuit = circuit.addConnection(makeConnection('ps1', 'vcc', 'spk1', 'in'));

    // Register a definition for the custom type so simulate doesn't fail
    registry.register(
      makeDef('custom-speaker', (inputs) => inputs, [
        { id: 'in', label: 'IN', type: 'input' },
      ])
    );

    const engine = new SimulationEngine(circuit);
    engine.evaluate();
    expect(engine.isActive()).toBe(true);
  });

  it('should accept a sample callback via setSampleCallback', () => {
    const circuit = new Circuit('test');
    const engine = new SimulationEngine(circuit);
    const cb = vi.fn();
    engine.setSampleCallback(cb);
    // Callback is stored — further integration tested with AudioBridge
    expect(() => engine.setSampleCallback(cb)).not.toThrow();
  });
});
