// tests/simulation/solver/matrix.test.ts
import { describe, it, expect } from 'vitest';
import { solveLinearSystem, luFactor, luSolve } from '@/simulation/solver/matrix';

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

describe('luFactor / luSolve', () => {
  function solveFlat(rows: number[][], rhs: number[]): Float64Array {
    const n = rows.length;
    const A = Float64Array.from(rows.flat());
    const piv = new Int32Array(n);
    const x = new Float64Array(n);
    luFactor(A, n, piv);
    luSolve(A, n, piv, Float64Array.from(rhs), x);
    return x;
  }

  it('solves a system that needs no pivoting', () => {
    const x = solveFlat([[2, 1], [1, 3]], [5, 10]);
    expect(x[0]).toBeCloseTo(1, 10);
    expect(x[1]).toBeCloseTo(3, 10);
  });

  it('solves a system where successive columns both swap rows', () => {
    // Column 0 pivots on row 2, then column 1 pivots on the row that was swapped down
    const rows = [[0, 2, 1], [1, 1, 1], [2, 1, 0]];
    const x = solveFlat(rows, [5, 6, 4]);
    const ref = solveLinearSystem(makeMatrix(rows), Float64Array.from([5, 6, 4]), 3);
    for (let i = 0; i < 3; i++) expect(x[i]).toBeCloseTo(ref[i], 10);
    // And the residual is zero
    for (let i = 0; i < 3; i++) {
      const r = rows[i][0] * x[0] + rows[i][1] * x[1] + rows[i][2] * x[2];
      expect(r).toBeCloseTo([5, 6, 4][i], 10);
    }
  });

  it('agrees with solveLinearSystem on MNA-shaped matrices of many sizes', () => {
    let seed = 12345;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 2; n <= 24; n++) {
      // Conductance-like diagonal dominance plus a few voltage-source style ±1 rows
      const rows = Array.from({ length: n }, () => new Array(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (rand() < 0.3) {
            const g = rand() * 1e-3;
            rows[i][i] += g; rows[j][j] += g; rows[i][j] -= g; rows[j][i] -= g;
          }
        }
        rows[i][i] += 1e-6;
      }
      const src = n - 1, node = Math.floor(rand() * (n - 1));
      rows[src] = new Array(n).fill(0);
      for (let i = 0; i < n; i++) rows[i][src] = 0;
      rows[src][node] = 1; rows[node][src] = 1;
      const rhs = Array.from({ length: n }, () => rand() - 0.5);

      const x = solveFlat(rows, rhs);
      const ref = solveLinearSystem(makeMatrix(rows), Float64Array.from(rhs), n);
      for (let i = 0; i < n; i++) {
        expect(Math.abs(x[i] - ref[i])).toBeLessThan(1e-6 * (1 + Math.abs(ref[i])));
      }
    }
  });

  it('treats an all-zero row as an unconstrained unknown instead of producing NaN', () => {
    const x = solveFlat([[1, 0], [0, 0]], [3, 0]);
    expect(x[0]).toBeCloseTo(3, 10);
    expect(x[1]).toBe(0);
  });
});
