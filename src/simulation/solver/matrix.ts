// src/simulation/solver/matrix.ts
export function solveLinearSystem(
  A: Float64Array[],
  b: Float64Array,
  N: number,
  M?: Float64Array[]
): Float64Array {
  if (!M) {
    M = new Array(N);
    for (let i = 0; i < N; i++) {
      M[i] = new Float64Array(N + 1);
    }
  }

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) M[i][j] = A[i][j];
    M[i][N] = b[i];
  }

  for (let col = 0; col < N; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < N; row++) {
      const val = Math.abs(M[row][col]);
      if (val > maxVal) { maxVal = val; maxRow = row; }
    }
    if (maxRow !== col) {
      const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
    }

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-15) continue;

    for (let row = col + 1; row < N; row++) {
      const factor = M[row][col] / pivot;
      for (let j = col; j <= N; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  const x = new Float64Array(N);
  for (let i = N - 1; i >= 0; i--) {
    let sum = M[i][N];
    for (let j = i + 1; j < N; j++) {
      sum -= M[i][j] * x[j];
    }
    const diag = M[i][i];
    x[i] = Math.abs(diag) > 1e-15 ? sum / diag : 0;
  }

  return x;
}

/**
 * In-place LU factorization with partial pivoting of a dense n×n matrix
 * stored row-major in a flat array. `piv[k]` records the row swapped into
 * position k. Near-zero pivots are left in place and treated as "no
 * constraint" by luSolve (the unknown resolves to 0), matching the
 * tolerance of solveLinearSystem for floating/degenerate rows.
 */
export function luFactor(A: Float64Array, n: number, piv: Int32Array): void {
  for (let k = 0; k < n; k++) {
    const kn = k * n;
    let maxRow = k;
    let maxVal = Math.abs(A[kn + k]);
    for (let r = k + 1; r < n; r++) {
      const v = Math.abs(A[r * n + k]);
      if (v > maxVal) { maxVal = v; maxRow = r; }
    }
    piv[k] = maxRow;
    if (maxRow !== k) {
      const mn = maxRow * n;
      for (let j = 0; j < n; j++) {
        const t = A[kn + j]; A[kn + j] = A[mn + j]; A[mn + j] = t;
      }
    }
    const pivot = A[kn + k];
    if (Math.abs(pivot) < 1e-15) continue;
    const inv = 1 / pivot;
    for (let r = k + 1; r < n; r++) {
      const rn = r * n;
      const f = A[rn + k] * inv;
      A[rn + k] = f;
      if (f !== 0) {
        for (let j = k + 1; j < n; j++) A[rn + j] -= f * A[kn + j];
      }
    }
  }
}

/** Solve LU·x = b using a factorization from luFactor. `b` is not modified. */
export function luSolve(
  LU: Float64Array, n: number, piv: Int32Array, b: Float64Array, x: Float64Array
): void {
  for (let i = 0; i < n; i++) x[i] = b[i];
  // luFactor swaps whole rows (multipliers included), so the full permutation
  // has to be applied to b before any elimination
  for (let k = 0; k < n; k++) {
    const p = piv[k];
    if (p !== k) { const t = x[k]; x[k] = x[p]; x[p] = t; }
  }
  // Forward substitution
  for (let k = 0; k < n; k++) {
    const xk = x[k];
    if (xk !== 0 && Math.abs(LU[k * n + k]) >= 1e-15) {
      for (let r = k + 1; r < n; r++) x[r] -= LU[r * n + k] * xk;
    }
  }
  // Back substitution
  for (let i = n - 1; i >= 0; i--) {
    const row = i * n;
    let sum = x[i];
    for (let j = i + 1; j < n; j++) sum -= LU[row + j] * x[j];
    const diag = LU[row + i];
    x[i] = Math.abs(diag) >= 1e-15 ? sum / diag : 0;
  }
}
