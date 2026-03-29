export function stampConductance(G: Float64Array[], n1: number, n2: number, g: number): void {
  if (n1 >= 0) G[n1][n1] += g;
  if (n2 >= 0) G[n2][n2] += g;
  if (n1 >= 0 && n2 >= 0) {
    G[n1][n2] -= g;
    G[n2][n1] -= g;
  }
}

export function stampVCCS(
  G: Float64Array[], outPos: number, outNeg: number,
  ctrlPos: number, ctrlNeg: number, gm: number
): void {
  if (outPos >= 0 && ctrlPos >= 0) G[outPos][ctrlPos] += gm;
  if (outPos >= 0 && ctrlNeg >= 0) G[outPos][ctrlNeg] -= gm;
  if (outNeg >= 0 && ctrlPos >= 0) G[outNeg][ctrlPos] -= gm;
  if (outNeg >= 0 && ctrlNeg >= 0) G[outNeg][ctrlNeg] += gm;
}

export function stampCurrentSource(b: Float64Array, nPos: number, nNeg: number, I: number): void {
  if (nPos >= 0) b[nPos] += I;
  if (nNeg >= 0) b[nNeg] -= I;
}
