export const BOLTZMANN_VOLTAGE = 0.02585;

export function computeVcrit(Is: number, n: number, Vt: number): number {
  const nVt = n * Vt;
  return nVt * Math.log(nVt / (Math.SQRT2 * Is));
}

export function limitJunctionVoltage(
  vNew: number, vOld: number, nVt: number, Vcrit: number
): number {
  if (vNew > Vcrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      return vOld + 2 * nVt * Math.sign(vNew - vOld);
    } else {
      return Vcrit;
    }
  }
  return vNew;
}

export function linearizeJunction(
  vd: number, Is: number, n: number, Vt: number
): { Gd: number; Ieq: number; Id: number } {
  const nVt = n * Vt;
  const expVd = Math.exp(vd / nVt);
  const Id = Is * (expVd - 1);
  const Gd = Math.max((Is / nVt) * expVd, 1e-12);
  const Ieq = Id - Gd * vd;
  return { Gd, Ieq, Id };
}
