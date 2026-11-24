/**
 * What the running circuit is seen to be doing, on the canvas and in the
 * inspector: an LED as bright as its current, a "!" on a part driven too
 * hard, and the meter's reading of whatever is selected.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from 'reactflow';
import { useEffect, type ReactNode } from 'react';
import { ComponentRegistry } from '@/components/registry/ComponentRegistry';
import { CircuitProvider, useCircuit } from '@/context/CircuitContext';
import { Circuit } from '@/models/Circuit';
import { LEDNode } from '@/views/CircuitCanvas/nodes/LEDNode';
import { CircuitNode } from '@/views/CircuitCanvas/nodes/CircuitNode';
import type { CircuitNodeData } from '@/views/CircuitCanvas/useCircuitSync';
import { Inspector } from '@/views/Inspector/Inspector';
import { InstrumentsContext, OVERLOADED, type InstrumentsValue, type MeterReport } from '@/views/Instruments';
import { connect, place, resistor } from '@/examples/circuits';
import type { Component, Connection } from '@/types/circuit';
import { ALL_PARTS } from './allParts';

beforeEach(() => {
  const registry = ComponentRegistry.getInstance();
  registry.clear();
  for (const definition of ALL_PARTS) registry.register(definition);
});

/** A meter the test reads out by hand. */
function instruments(playing: boolean, overloaded: string[] = []) {
  const listeners = new Set<(report: MeterReport) => void>();
  const value: InstrumentsValue = {
    playing, overloaded: new Set(overloaded),
    meter: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  return { value, read: (report: MeterReport) => act(() => listeners.forEach((listener) => listener(report))), listeners };
}

const node = (component: Component, viewMode: 'schematic' | 'board', light = 0) =>
  ({ id: component.id, data: { component, viewMode, light }, selected: false }) as unknown as NodeProps<CircuitNodeData>;
const onCanvas = (children: ReactNode, value?: InstrumentsValue) => render(
  <CircuitProvider>
    <ReactFlowProvider>
      {value ? <InstrumentsContext.Provider value={value}>{children}</InstrumentsContext.Provider> : children}
    </ReactFlowProvider>
  </CircuitProvider>,
);

describe('an LED on the canvas', () => {
  it.each(['schematic', 'board'] as const)('is dark with no current (%s)', (viewMode) => {
    onCanvas(<LEDNode {...node(place('led', 0, 0), viewMode)} />);
    expect(screen.queryByTestId('led-glow')).toBeNull();
  });

  it.each(['schematic', 'board'] as const)('glows more the brighter it is (%s)', (viewMode) => {
    const led = place('led', 0, 0);
    const view = onCanvas(<LEDNode {...node(led, viewMode, 0.35)} />);
    const dim = screen.getByTestId('led-glow');
    expect(dim).toHaveAttribute('data-light', '0.35');
    const dimSize = Number(dim.getAttribute('r')), dimOpacity = Number(dim.getAttribute('opacity'));
    view.unmount();
    onCanvas(<LEDNode {...node(led, viewMode, 0.9)} />);
    const bright = screen.getByTestId('led-glow');
    expect(Number(bright.getAttribute('r'))).toBeGreaterThan(dimSize);
    expect(Number(bright.getAttribute('opacity'))).toBeGreaterThan(dimOpacity);
  });
});

describe('the ! on an overloaded part', () => {
  it('is not there while all is well', () => {
    onCanvas(<CircuitNode {...node(resistor(100, 0, 0), 'schematic')} />, instruments(true).value);
    expect(screen.queryByTestId('overload-mark')).toBeNull();
  });

  it('marks the part that is overloaded, and says what a real one would do', () => {
    const r = resistor(100, 0, 0), led = place('led', 0, 0);
    onCanvas(<><CircuitNode {...node(r, 'schematic')} /><LEDNode {...node(led, 'board', 1)} /></>, instruments(true, [led.id]).value);
    const marks = screen.getAllByTestId('overload-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent('!');
    expect(marks[0]).toHaveAccessibleName(/^Overloaded\. .*resistor in line/);
  });

  it('every part that can be overloaded says something of its own about it', () => {
    for (const type of ['led', 'resistor', '1n914', 'power']) {
      const definition = ComponentRegistry.getInstance().get(type);
      expect(definition, type).toBeDefined();
      expect(definition!.overload, type).toBeTruthy();
      expect(definition!.overload).not.toBe(OVERLOADED);
    }
  });
});

describe('the meter in the inspector', () => {
  /** A circuit with the given parts, one thing selected, and the inspector open on it. */
  function inspect(parts: Component[], wires: Connection[], selected: { part?: Component; wire?: Connection }, meter: ReturnType<typeof instruments>) {
    let circuit = new Circuit('Test');
    for (const part of parts) circuit = circuit.addComponent(part);
    for (const wire of wires) circuit = circuit.addConnection(wire);
    function Select() {
      const { setSelection } = useCircuit();
      useEffect(() => setSelection(selected.part ? [selected.part.id] : [], selected.wire ? [selected.wire.id] : []), [setSelection]);
      return null;
    }
    return render(
      <CircuitProvider initial={{ circuit, dirty: false }}>
        <InstrumentsContext.Provider value={meter.value}>
          <Select />
          <Inspector viewMode="schematic" onDeleteComponents={vi.fn()} />
        </InstrumentsContext.Provider>
      </CircuitProvider>,
    );
  }
  const steady = (value: number) => ({ mean: value, min: value, max: value });

  it('says to press play while nothing is running', () => {
    const r = resistor(470, 0, 0);
    inspect([r], [], { part: r }, instruments(false));
    expect(screen.getByTestId('inspector-meter')).toHaveTextContent('Press play to read its voltage and current.');
  });

  it('reads the current through a part and the voltage across it', () => {
    const r = resistor(470, 0, 0), meter = instruments(true);
    inspect([r], [], { part: r }, meter);
    expect(screen.getByTestId('meter-volts')).toHaveTextContent('…');
    meter.read({ probes: [], target: { target: { componentId: r.id }, volts: { ...steady(6.836), hertz: null }, amps: steady(0.014543) } });
    expect(screen.getByTestId('meter-amps')).toHaveTextContent('14.5 mA');
    expect(screen.getByTestId('meter-volts')).toHaveTextContent('6.84 V');
    expect(screen.queryByTestId('meter-hertz')).toBeNull();
  });

  it('shows sizes, whichever way round the part happens to be', () => {
    const r = resistor(470, 0, 0), meter = instruments(true);
    inspect([r], [], { part: r }, meter);
    meter.read({ probes: [], target: { target: { componentId: r.id }, volts: { ...steady(-6.836), hertz: null }, amps: steady(-0.014543) } });
    expect(screen.getByTestId('meter-amps')).toHaveTextContent(/^14\.5 mA$/);
    expect(screen.getByTestId('meter-volts')).toHaveTextContent(/^6\.84 V$/);
  });

  it('reads a wire\'s voltage, and its frequency when it has one', () => {
    const a = resistor(100, 0, 0), b = resistor(100, 100, 0), wire = connect(a, 1, b, 0), meter = instruments(true);
    inspect([a, b], [wire], { wire }, meter);
    const target = { componentId: a.id, pinId: a.pins[1].id };
    meter.read({ probes: [], target: { target, volts: { mean: 4.5, min: 0, max: 9, hertz: 441 }, amps: null } });
    expect(screen.queryByTestId('meter-amps')).toBeNull();
    expect(screen.getByTestId('meter-volts')).toHaveTextContent('0 V to 9.00 V');
    expect(screen.getByTestId('meter-hertz')).toHaveTextContent('441 Hz');
  });

  it('does not show a reading that was taken of something else', () => {
    const r = resistor(470, 0, 0), meter = instruments(true);
    inspect([r], [], { part: r }, meter);
    meter.read({ probes: [], target: { target: { componentId: 'another' }, volts: { ...steady(1), hertz: null }, amps: steady(1) } });
    expect(screen.getByTestId('meter-volts')).toHaveTextContent('…');
    expect(screen.queryByTestId('meter-amps')).toBeNull();
  });

  it('has no meter for a part it cannot read one number off', () => {
    const chip = place('cd40106', 0, 0), meter = instruments(true);
    inspect([chip], [], { part: chip }, meter);
    expect(screen.queryByTestId('inspector-meter')).toBeNull();
    expect(meter.listeners.size).toBe(0);
  });

  it('explains the ! on the part that has one', () => {
    const led = place('led', 0, 0);
    inspect([led], [], { part: led }, instruments(true, [led.id]));
    expect(screen.getByTestId('inspector-overload')).toHaveTextContent(/resistor in line/);
  });

  it('...and says nothing of it otherwise', () => {
    const led = place('led', 0, 0);
    inspect([led], [], { part: led }, instruments(true, ['another']));
    expect(screen.queryByTestId('inspector-overload')).toBeNull();
  });
});
