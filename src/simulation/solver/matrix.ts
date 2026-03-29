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
