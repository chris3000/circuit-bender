export const BOLTZMANN_VOLTAGE = 0.02585;

/** Beyond this exponent the junction is continued as a straight line, so nothing can overflow. */
const MAX_EXP_ARG = 80;

export function computeVcrit(Is: number, n: number, Vt: number): number {
  const nVt = n * Vt;
  return nVt * Math.log(nVt / (Math.SQRT2 * Is));
}

/**
 * SPICE junction voltage limiting (pnjlim). Newton's method on an exponential
 * overshoots wildly when the voltage guess rises too far in one iteration;
 * this compresses large forward steps logarithmically so the iteration
 * converges instead of diverging.
 *
 * `vOld` must be the voltage the junction was linearized at in the PREVIOUS
 * ITERATION, not the previous timestep.
 */
export function limitJunctionVoltage(
  vNew: number, vOld: number, nVt: number, Vcrit: number
): number {
  if (vNew > Vcrit && Math.abs(vNew - vOld) > 2 * nVt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nVt;
      return arg > 0 ? vOld + nVt * Math.log(arg) : Vcrit;
    }
    return nVt * Math.log(vNew / nVt);
  }
  return vNew;
}

/**
 * Shockley diode current and its derivative at vd, as a Norton companion:
 * i(v) ≈ Gd·v + Ieq around the operating point.
 */
export function linearizeJunction(
  vd: number, Is: number, n: number, Vt: number
): { Gd: number; Ieq: number; Id: number } {
  const nVt = n * Vt;
  const arg = vd / nVt;
  let Id: number;
  let slope: number;
  if (arg > MAX_EXP_ARG) {
    const e = Math.exp(MAX_EXP_ARG);
    slope = (Is / nVt) * e;
    Id = Is * (e - 1) + slope * (vd - MAX_EXP_ARG * nVt);
  } else {
    const e = Math.exp(arg);
    Id = Is * (e - 1);
    slope = (Is / nVt) * e;
  }
  const Gd = Math.max(slope, 1e-12);
  const Ieq = Id - Gd * vd;
  return { Gd, Ieq, Id };
}

/** SPICE's device-current tolerances: absolute (amps) and relative. */
const CURRENT_ABSTOL = 1e-12;
const CURRENT_RELTOL = 1e-3;

/**
 * True if a device current predicted from the last linearization agrees with
 * the current the device equation actually gives at the new voltages. When it
 * does, the linear solve was already exact enough and no further Newton
 * iteration is needed, however far the node voltages themselves moved.
 */
export function currentConverged(predicted: number, actual: number): boolean {
  return Math.abs(predicted - actual) <= CURRENT_ABSTOL + CURRENT_RELTOL * Math.abs(actual);
}
