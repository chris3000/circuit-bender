// tests/simulation/solver/matrix.test.ts
import { describe, it, expect } from 'vitest';
import { solveLinearSystem } from '@/simulation/solver/matrix';

function makeMatrix(rows: number[][]): Float64Array[] {
  return rows.map(r => Float64Array.from(r));
}

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    const A = makeMatrix([[2, 1], [1, 3]]);
    const b = Float64Array.from([5, 10]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('solves a 3x3 system (resistor divider MNA)', () => {
    const g = 1e-4;
    const A = makeMatrix([
      [g, -g, 1],
      [-g, 2 * g, 0],
      [1, 0, 0],
    ]);
    const b = Float64Array.from([0, 0, 9]);
    const x = solveLinearSystem(A, b, 3);
    expect(x[0]).toBeCloseTo(9, 6);
    expect(x[1]).toBeCloseTo(4.5, 6);
  });

  it('handles near-singular matrix gracefully', () => {
    const A = makeMatrix([[0, 0], [0, 1]]);
    const b = Float64Array.from([0, 5]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[1]).toBeCloseTo(5, 10);
    expect(x[0]).toBe(0);
  });

  it('uses partial pivoting for ill-conditioned systems', () => {
    const A = makeMatrix([[1e-15, 1], [1, 1]]);
    const b = Float64Array.from([1, 2]);
    const x = solveLinearSystem(A, b, 2);
    expect(x[0]).toBeCloseTo(1, 6);
    expect(x[1]).toBeCloseTo(1, 6);
  });

  it('reuses pre-allocated augmented matrix', () => {
    const A = makeMatrix([[2, 1], [1, 3]]);
    const b = Float64Array.from([5, 10]);
    const M = [new Float64Array(3), new Float64Array(3)];
    const x = solveLinearSystem(A, b, 2, M);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });
});
