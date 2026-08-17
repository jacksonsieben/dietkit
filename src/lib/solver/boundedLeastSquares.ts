/**
 * Bounded least squares:
 *
 *     minimise  ‖ W(A·q − t) ‖²  +  Σ λⱼ (qⱼ − rⱼ)²
 *     subject to  lo ≤ q ≤ hi
 *
 * Written as a normal-equations QP — `H = AᵀWA + Λ`, `b = AᵀWt + Λr` — because
 * `m` (macros) is 3 and `n` (foods) is 5–15, so `H` is a tiny dense matrix and
 * forming it costs nothing. Two solvers then take turns on it:
 *
 * 1. **An exact coordinate sweep.** Moves each variable to its own 1-D minimiser
 *    and clamps it into its box. Monotone and cheap, so it can always make
 *    progress — this is what makes the whole routine safe.
 * 2. **An active-set Newton step** on the free variables, via Cholesky. Exact
 *    for a quadratic, and accepted only if it lowers the objective. This is what
 *    makes the routine *fast*.
 *
 * Step 2 exists because step 1 alone is not good enough, and finding that out
 * was the point of the spike. Coordinate descent crawls along the flat
 * directions an underdetermined meal is full of: on a 3×5 problem it needed
 * ~5,300 sweeps to settle. With the Newton step, every meal size measured here
 * finishes in one or two rounds.
 *
 * Convergence is judged on the KKT residual rather than on how far the last
 * step moved — see `kktResidual` below for why that distinction matters.
 *
 * Why no library: this is the whole method, it has no dependencies, and it can
 * be instrumented for the residual and active-bound reporting the UI needs. A
 * general QP package is orders of magnitude more code to ship to a phone for
 * the same answer at this size.
 */

export type ActiveBound = "lower" | "upper" | null;

export interface BoundedLeastSquaresProblem {
  /** m × n composition matrix: `A[i][j]` is macro `i` per unit of food `j`. */
  A: readonly (readonly number[])[];
  /** m targets. */
  t: readonly number[];
  /** n lower bounds. */
  lo: readonly number[];
  /** n upper bounds. Swapped bounds are tolerated, not trusted. */
  hi: readonly number[];
  /** m row weights, default 1. Trades macros off against each other. */
  weights?: readonly number[];
  /**
   * n reference quantities the solution is pulled toward. Defaults to the
   * midpoint of each box.
   */
  reference?: readonly number[];
  /**
   * Strength of that pull, relative to each variable's own data term
   * (`ρ · Σᵢ wᵢ A[i][j]²`), so it is scale-free.
   *
   * Load-bearing, not a numerical nicety. A meal has 3 equations and 5–15
   * unknowns, so the fit is massively underdetermined: infinitely many quantity
   * vectors hit the macro targets exactly, and without a tie-breaker the solver
   * returns whichever one it happens to reach first. The user then watches a
   * one-gram target edit swing a food by 80 g. The pull makes the problem
   * strictly convex — one solution, continuous in the inputs, and the one
   * closest to the portions already on the plan.
   *
   * At the default it costs well under a gram of macro accuracy.
   */
  regularisation?: number;
  /** Starting point, default `reference` clamped into the box. */
  initial?: readonly number[];
  maxIterations?: number;
  /**
   * Stop when the KKT residual falls below this, relative to the scale of the
   * targets — or when neither solver can move any variable further than this.
   */
  tolerance?: number;
}

export interface BoundedLeastSquaresResult {
  q: number[];
  /** `A·q − t`, per macro. Positive is over target. */
  residual: number[];
  objective: number;
  /** Rounds of sweep-plus-Newton performed. */
  iterations: number;
  converged: boolean;
  /** Which variables ended pinned — the reason a residual could not close. */
  active: ActiveBound[];
}

const DEFAULT_REGULARISATION = 1e-3;
const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-9;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * Solves `H_FF · d = −g_F` for the free variables by Cholesky factorisation.
 * Returns null if the submatrix is not positive definite, which the caller
 * treats as "skip the Newton step this round".
 */
function newtonDirection(
  H: readonly number[][],
  g: readonly number[],
  free: readonly number[],
): number[] | null {
  const k = free.length;
  const L: number[][] = Array.from({ length: k }, () =>
    new Array<number>(k).fill(0),
  );

  for (let a = 0; a < k; a += 1) {
    const rowA = H[free[a]!]!;
    for (let b = 0; b <= a; b += 1) {
      let sum = rowA[free[b]!]!;
      for (let c = 0; c < b; c += 1) sum -= L[a]![c]! * L[b]![c]!;
      if (a === b) {
        if (!(sum > 0)) return null;
        L[a]![a] = Math.sqrt(sum);
      } else {
        L[a]![b] = sum / L[b]![b]!;
      }
    }
  }

  const y = new Array<number>(k).fill(0);
  for (let a = 0; a < k; a += 1) {
    let sum = -g[free[a]!]!;
    for (let c = 0; c < a; c += 1) sum -= L[a]![c]! * y[c]!;
    y[a] = sum / L[a]![a]!;
  }

  const d = new Array<number>(k).fill(0);
  for (let a = k - 1; a >= 0; a -= 1) {
    let sum = y[a]!;
    for (let c = a + 1; c < k; c += 1) sum -= L[c]![a]! * d[c]!;
    d[a] = sum / L[a]![a]!;
  }

  return d;
}

export function solveBoundedLeastSquares(
  problem: BoundedLeastSquaresProblem,
): BoundedLeastSquaresResult {
  const {
    A,
    t,
    weights,
    reference,
    regularisation = DEFAULT_REGULARISATION,
    initial,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    tolerance = DEFAULT_TOLERANCE,
  } = problem;

  const m = t.length;
  const n = problem.lo.length;

  const lo = problem.lo.map((value, j) => Math.min(value, problem.hi[j]!));
  const hi = problem.hi.map((value, j) => Math.max(value, problem.lo[j]!));
  const w = weights ?? new Array<number>(m).fill(1);
  const ref = Array.from({ length: n }, (_, j) =>
    clamp(reference?.[j] ?? (lo[j]! + hi[j]!) / 2, lo[j]!, hi[j]!),
  );
  const q = Array.from({ length: n }, (_, j) =>
    clamp(initial?.[j] ?? ref[j]!, lo[j]!, hi[j]!),
  );

  // λⱼ scaled by each column's own curvature keeps the pull scale-free.
  const lambda = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j += 1) {
    let curvature = 0;
    for (let i = 0; i < m; i += 1) curvature += w[i]! * A[i]![j]! * A[i]![j]!;
    lambda[j] = regularisation * curvature;
  }

  // H = AᵀWA + Λ, b = AᵀWt + Λr.
  const H: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(0),
  );
  const b = new Array<number>(n).fill(0);
  for (let j = 0; j < n; j += 1) {
    for (let k = j; k < n; k += 1) {
      let sum = 0;
      for (let i = 0; i < m; i += 1) sum += w[i]! * A[i]![j]! * A[i]![k]!;
      H[j]![k] = sum;
      H[k]![j] = sum;
    }
    H[j]![j] += lambda[j]!;

    let rhs = lambda[j]! * ref[j]!;
    for (let i = 0; i < m; i += 1) rhs += w[i]! * A[i]![j]! * t[i]!;
    b[j] = rhs;
  }

  // A food that contributes no macro is unidentifiable — nothing in the
  // objective distinguishes any quantity of it. Leave it where it started
  // rather than dividing by a zero diagonal.
  const identifiable = Array.from({ length: n }, (_, j) => H[j]![j]! > 0);

  // g = H·q − b, kept up to date as q moves. Half the true gradient; the factor
  // of two cancels everywhere it is used.
  const gradient = new Array<number>(n).fill(0);
  const refreshGradient = (at: readonly number[]): void => {
    for (let j = 0; j < n; j += 1) {
      let sum = -b[j]!;
      const row = H[j]!;
      for (let k = 0; k < n; k += 1) sum += row[k]! * at[k]!;
      gradient[j] = sum;
    }
  };
  refreshGradient(q);

  // φ(q) = qᵀHq − 2bᵀq = qᵀ(g − b). Differs from the true objective by a
  // constant, which is all a line search needs.
  const phi = (at: readonly number[], g: readonly number[]): number => {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += at[j]! * (g[j]! - b[j]!);
    return sum;
  };

  /** One exact coordinate sweep. Monotone, so progress is always available. */
  const sweep = (): number => {
    let biggest = 0;
    for (let j = 0; j < n; j += 1) {
      if (!identifiable[j]) continue;
      const next = clamp(q[j]! - gradient[j]! / H[j]![j]!, lo[j]!, hi[j]!);
      const step = next - q[j]!;
      if (step === 0) continue;
      q[j] = next;
      const column = H[j]!;
      for (let k = 0; k < n; k += 1) gradient[k] += column[k]! * step;
      const magnitude = Math.abs(step);
      if (magnitude > biggest) biggest = magnitude;
    }
    return biggest;
  };

  /**
   * One active-set Newton step, in the Lawson–Hanson / BVLS style.
   *
   * Solves the problem exactly on the variables believed to be free, and if that
   * exact answer would leave the box, parks the worst offender on the bound it
   * crossed and solves again without it. At most one variable is parked per
   * round, so this settles quickly, and the result is the true minimiser over
   * the free set rather than a step that has been clamped into nonsense.
   *
   * Simply clamping the step, which is the obvious thing to write, does not
   * work: a variable close to a bound but not yet on it counts as free, the
   * Newton direction sends it far past, and clamping mangles the step badly
   * enough that the line search has to shrink it to nothing. That version
   * crawled, taking 117 rounds on 15 foods and 502 on 30 where this takes a
   * handful.
   */
  const newton = (): number => {
    const fixed = Array.from({ length: n }, (_, j) => {
      if (!identifiable[j]) return true;
      if (q[j]! <= lo[j]! && gradient[j]! > 0) return true;
      if (q[j]! >= hi[j]! && gradient[j]! < 0) return true;
      return false;
    });

    const trial = q.slice();
    const trialGradient = gradient.slice();
    const refreshTrialGradient = (): void => {
      for (let j = 0; j < n; j += 1) {
        let sum = -b[j]!;
        const row = H[j]!;
        for (let k = 0; k < n; k += 1) sum += row[k]! * trial[k]!;
        trialGradient[j] = sum;
      }
    };

    for (let round = 0; round <= n; round += 1) {
      const free: number[] = [];
      for (let j = 0; j < n; j += 1) if (!fixed[j]) free.push(j);
      if (free.length === 0) break;

      const direction = newtonDirection(H, trialGradient, free);
      if (direction === null) return 0;

      let worstExcess = 0;
      let offender = -1;
      let offenderStep = 0;
      free.forEach((j, a) => {
        const value = trial[j]! + direction[a]!;
        const excess =
          value < lo[j]! ? lo[j]! - value : value > hi[j]! ? value - hi[j]! : 0;
        if (excess > worstExcess) {
          worstExcess = excess;
          offender = j;
          offenderStep = direction[a]!;
        }
      });

      if (offender === -1) {
        free.forEach((j, a) => {
          trial[j] = trial[j]! + direction[a]!;
        });
        refreshTrialGradient();
        break;
      }

      trial[offender] = clamp(
        trial[offender]! + offenderStep,
        lo[offender]!,
        hi[offender]!,
      );
      fixed[offender] = true;
      refreshTrialGradient();
    }

    // Only worth taking if it actually lowers the objective — the sweep is
    // always still available, so a rejected step is not a failure.
    if (!(phi(trial, trialGradient) < phi(q, gradient))) return 0;

    let biggest = 0;
    for (let j = 0; j < n; j += 1) {
      const magnitude = Math.abs(trial[j]! - q[j]!);
      if (magnitude > biggest) biggest = magnitude;
      q[j] = trial[j]!;
      gradient[j] = trialGradient[j]!;
    }
    return biggest;
  };

  /**
   * How far the current point is from satisfying the KKT conditions. A variable
   * pushing outward against a bound it already sits on is optimal, so its
   * gradient does not count against us; anything else must be flat.
   *
   * This, not the step size, is what says the solve is done. The sweep drives
   * each coordinate to its own exact minimiser, but the coordinates are coupled,
   * so it keeps taking ever-smaller steps long after the answer has stopped
   * changing in any way a kitchen scale could show. Watching the gradient
   * instead ends the solve when it is actually optimal.
   */
  const kktResidual = (): number => {
    let worst = 0;
    for (let j = 0; j < n; j += 1) {
      if (!identifiable[j]) continue;
      const g = gradient[j]!;
      if (q[j]! <= lo[j]! && g > 0) continue;
      if (q[j]! >= hi[j]! && g < 0) continue;
      if (Math.abs(g) > worst) worst = Math.abs(g);
    }
    return worst;
  };
  // Relative, because the gradient carries the scale of the targets.
  const kktTolerance = tolerance * Math.max(1, ...b.map(Math.abs));

  let iterations = 0;
  let converged = false;
  while (iterations < maxIterations) {
    iterations += 1;
    const moved = Math.max(sweep(), newton());
    if (moved <= tolerance || kktResidual() <= kktTolerance) {
      converged = true;
      break;
    }
  }

  const residual = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i += 1) {
    let sum = 0;
    for (let j = 0; j < n; j += 1) sum += A[i]![j]! * q[j]!;
    residual[i] = sum - t[i]!;
  }

  let objective = 0;
  for (let i = 0; i < m; i += 1) objective += w[i]! * residual[i]! * residual[i]!;
  for (let j = 0; j < n; j += 1) {
    const drift = q[j]! - ref[j]!;
    objective += lambda[j]! * drift * drift;
  }

  const active: ActiveBound[] = q.map((value, j) =>
    value <= lo[j]! ? "lower" : value >= hi[j]! ? "upper" : null,
  );

  return { q, residual, objective, iterations, converged, active };
}
