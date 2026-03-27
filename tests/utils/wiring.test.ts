import { describe, it, expect } from 'vitest';
import { validateConnection, generateOrthogonalPath } from '@/utils/wiring';
import { Circuit } from '@/models/Circuit';
import { createComponentFromDefinition } from '@/utils/componentFactory';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { snapToGrid } from '@/utils/grid';
import { generateConnectionId, generateNetId } from '@/utils/ids';
import type { ComponentId, PinId } from '@/types/circuit';

describe('validateConnection', () => {
  function createTestCircuit() {
    const comp1 = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(100),
      y: snapToGrid(200),
    });
    const comp2 = createComponentFromDefinition(resistorDefinition, {
      x: snapToGrid(300),
      y: snapToGrid(200),
    });

    let circuit = new Circuit('Test Circuit');
    circuit = circuit.addComponent(comp1);
    circuit = circuit.addComponent(comp2);

    return { circuit, comp1, comp2 };
  }

  it('should reject connection from a pin to itself', () => {
    const { circuit, comp1 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp1.id,
      comp1.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/same pin/i);
  });

  it('should reject duplicate connections (same direction)', () => {
    const { circuit: baseCircuit, comp1, comp2 } = createTestCircuit();

    // Add a connection first
    // Using imported generateConnectionId and generateNetId
    const connection = {
      id: generateConnectionId(),
      from: { componentId: comp1.id, pinId: comp1.pins[0].id },
      to: { componentId: comp2.id, pinId: comp2.pins[0].id },
      net: generateNetId(),
    };
    const circuit = baseCircuit.addConnection(connection);

    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp2.id,
      comp2.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/duplicate|already/i);
  });

  it('should reject duplicate connections (reverse direction)', () => {
    const { circuit: baseCircuit, comp1, comp2 } = createTestCircuit();

    // Using imported generateConnectionId and generateNetId
    const connection = {
      id: generateConnectionId(),
      from: { componentId: comp1.id, pinId: comp1.pins[0].id },
      to: { componentId: comp2.id, pinId: comp2.pins[0].id },
      net: generateNetId(),
    };
    const circuit = baseCircuit.addConnection(connection);

    // Try reverse direction: comp2 -> comp1
    const result = validateConnection(
      comp2.id,
      comp2.pins[0].id,
      comp1.id,
      comp1.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/duplicate|already/i);
  });

  it('should reject if from-component does not exist', () => {
    const { circuit, comp2 } = createTestCircuit();
    const result = validateConnection(
      'nonexistent' as ComponentId,
      'pin_0' as PinId,
      comp2.id,
      comp2.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/component.*not found/i);
  });

  it('should reject if to-component does not exist', () => {
    const { circuit, comp1 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      'nonexistent' as ComponentId,
      'pin_0' as PinId,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/component.*not found/i);
  });

  it('should reject if from-pin does not exist on component', () => {
    const { circuit, comp1, comp2 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      'nonexistent_pin' as PinId,
      comp2.id,
      comp2.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/pin.*not found/i);
  });

  it('should reject if to-pin does not exist on component', () => {
    const { circuit, comp1, comp2 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp2.id,
      'nonexistent_pin' as PinId,
      circuit
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/pin.*not found/i);
  });

  it('should accept a valid connection between different pins', () => {
    const { circuit, comp1, comp2 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp2.id,
      comp2.pins[0].id,
      circuit
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should accept connection between different pins on same component', () => {
    const { circuit, comp1 } = createTestCircuit();
    const result = validateConnection(
      comp1.id,
      comp1.pins[0].id,
      comp1.id,
      comp1.pins[1].id,
      circuit
    );
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('generateOrthogonalPath', () => {
  it('should generate a Manhattan-style path with correct format', () => {
    const path = generateOrthogonalPath(100, 200, 300, 400);
    // midX = (100 + 300) / 2 = 200
    expect(path).toBe('M 100,200 H 200 V 400 H 300');
  });

  it('should handle same start and end points', () => {
    const path = generateOrthogonalPath(100, 200, 100, 200);
    // midX = (100 + 100) / 2 = 100
    expect(path).toBe('M 100,200 H 100 V 200 H 100');
  });

  it('should handle horizontal-only paths', () => {
    const path = generateOrthogonalPath(0, 100, 200, 100);
    // midX = (0 + 200) / 2 = 100
    expect(path).toBe('M 0,100 H 100 V 100 H 200');
  });

  it('should handle vertical-only paths (start and end have same x)', () => {
    const path = generateOrthogonalPath(100, 0, 100, 200);
    // midX = (100 + 100) / 2 = 100
    expect(path).toBe('M 100,0 H 100 V 200 H 100');
  });

  it('should handle negative coordinates', () => {
    const path = generateOrthogonalPath(-50, -100, 50, 100);
    // midX = (-50 + 50) / 2 = 0
    expect(path).toBe('M -50,-100 H 0 V 100 H 50');
  });
});
