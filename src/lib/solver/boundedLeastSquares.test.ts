import { describe, expect, it } from "vitest";

import { solveBoundedLeastSquares } from "./boundedLeastSquares";

describe("solveBoundedLeastSquares", () => {
  it("finds the unconstrained least-squares answer when no bound binds", () => {
    // Two conflicting measurements of one variable: the mean is the minimiser.
    const result = solveBoundedLeastSquares({
      A: [[1], [1]],
      t: [1, 3],
      lo: [-10],
      hi: [10],
      regularisation: 0,
    });

    expect(result.converged).toBe(true);
    expect(result.q[0]).toBeCloseTo(2, 9);
    expect(result.residual).toEqual([expect.closeTo(1, 9), expect.closeTo(-1, 9)]);
    expect(result.objective).toBeCloseTo(2, 9);
    expect(result.active).toEqual([null]);
  });

  it("clamps to the box and reports which bound bound", () => {
    const result = solveBoundedLeastSquares({
      A: [
        [1, 0],
        [0, 1],
      ],
      t: [2, 5],
      lo: [0, 0],
      hi: [1, 10],
      regularisation: 0,
    });

    expect(result.q[0]).toBeCloseTo(1, 9);
    expect(result.q[1]).toBeCloseTo(5, 9);
    expect(result.active).toEqual(["upper", null]);
    // The unreachable part stays in the residual rather than disappearing.
    expect(result.residual[0]).toBeCloseTo(-1, 9);
  });

  it("respects a lower bound the fit would rather cross", () => {
    const result = solveBoundedLeastSquares({
      A: [[1]],
      t: [-5],
      lo: [0],
      hi: [10],
      regularisation: 0,
    });

    expect(result.q[0]).toBe(0);
    expect(result.active).toEqual(["lower"]);
    expect(result.residual[0]).toBeCloseTo(5, 9);
  });

  it("lets row weights decide which target wins", () => {
    // minimise 9q² + (q − 10)²  ⇒  q = 1
    const result = solveBoundedLeastSquares({
      A: [[1], [1]],
      t: [0, 10],
      lo: [-100],
      hi: [100],
      weights: [9, 1],
      regularisation: 0,
    });

    expect(result.q[0]).toBeCloseTo(1, 9);
  });

  it("leaves a variable nothing in the objective depends on where it started", () => {
    const result = solveBoundedLeastSquares({
      A: [[1, 0]],
      t: [5],
      lo: [0, 0],
      hi: [10, 10],
      initial: [0, 7],
      // Anchored at the answer, so the default pull cannot bias q[0] — this
      // test is about the second variable, not about the anchor.
      reference: [5, 7],
    });

    expect(result.q[0]).toBeCloseTo(5, 6);
    expect(result.q[1]).toBe(7);
  });

  it("reports non-convergence rather than pretending, and still returns a usable point", () => {
    // Everything realistic settles in one or two rounds, so starving the budget
    // outright is the only way to watch the flag do its job. What matters is
    // that `converged` is answered honestly and the caller still gets a plan
    // inside its bounds rather than an exception or a half-written array.
    const result = solveBoundedLeastSquares({
      A: [
        [1, 1, 1],
        [1, 2, 4],
      ],
      t: [10, 20],
      lo: [0, 0, 0],
      hi: [20, 20, 20],
      initial: [30, -5, 7],
      maxIterations: 0,
    });

    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.q).toEqual([20, 0, 7]);
  });

  describe("underdetermined problems", () => {
    // 3 equations, 5 unknowns — the shape a real meal has, and the reason the
    // anchor term exists.
    const problem = {
      A: [
        [1, 2, 0, 1, 0],
        [3, 0, 1, 1, 2],
        [0, 1, 2, 0, 1],
      ],
      t: [10, 20, 8],
      lo: [0, 0, 0, 0, 0],
      hi: [20, 20, 20, 20, 20],
      reference: [10, 10, 10, 10, 10],
    };

    it("has more than one exact fit, so an unanchored solve is ambiguous", () => {
      const fromLow = solveBoundedLeastSquares({
        ...problem,
        regularisation: 0,
        initial: [0, 0, 0, 0, 0],
      });
      const fromHigh = solveBoundedLeastSquares({
        ...problem,
        regularisation: 0,
        initial: [20, 20, 20, 20, 20],
      });

      // Both fit the data essentially perfectly...
      expect(fromLow.objective).toBeLessThan(1e-6);
      expect(fromHigh.objective).toBeLessThan(1e-6);
      // ...at genuinely different quantities. Left like this, the answer the
      // user sees would depend on where the solve happened to start.
      const spread = Math.max(
        ...fromLow.q.map((value, j) => Math.abs(value - fromHigh.q[j]!)),
      );
      expect(spread).toBeGreaterThan(1);
    });

    it("is made unique by the anchor term", () => {
      const fromLow = solveBoundedLeastSquares({
        ...problem,
        initial: [0, 0, 0, 0, 0],
      });
      const fromHigh = solveBoundedLeastSquares({
        ...problem,
        initial: [20, 20, 20, 20, 20],
      });

      fromLow.q.forEach((value, j) => {
        expect(value).toBeCloseTo(fromHigh.q[j]!, 4);
      });
      // And the fit is barely worse for it.
      expect(
        Math.max(...fromLow.residual.map(Math.abs)),
      ).toBeLessThan(0.05);
    });

    it("responds proportionately to a small change in target", () => {
      const base = solveBoundedLeastSquares(problem);
      const nudged = solveBoundedLeastSquares({
        ...problem,
        t: [10.1, 20, 8],
      });

      const swing = Math.max(
        ...base.q.map((value, j) => Math.abs(value - nudged.q[j]!)),
      );
      expect(swing).toBeLessThan(0.5);
    });
  });
});
