# Spike — joint three-macro solver

> Resolves the P0 spike (#6). Background: [MACRO-RECONCILIATION.md](MACRO-RECONCILIATION.md).
> Implementation: `src/lib/solver/`. Every number below is measured by the tests
> in that directory — `npx vitest run src/lib/solver/`.

**Verdict: build it.** A bounded least-squares solve, written by hand with no
dependency, settles realistic meals in 1–2 iterations and well under a
millisecond. It subsumes the predecessor's fat-vehicle workaround, and the whole
of the two-pass fat logic falls out of it for free.

---

## The four questions

### Does bounded least-squares converge reliably for realistic meals (5–15 foods)?

Yes — but not with the algorithm the issue sketches, and the reason is worth
recording because it shaped the design.

The problem as posed is **massively underdetermined**: three macro equations
against 5–15 food quantities. There is not one exact fit but an infinite family
of them, and a plain projected solve returns whichever member of that family the
sweep order happens to reach. In the test at
`boundedLeastSquares.test.ts` ("has more than one exact fit"), a 3×5 problem
started from all-zeros and from all-twenties both hit an objective below `1e-6`
at quantities more than 1 unit apart. Shipped like that, portions would jump
around as the user typed — the same target, a different meal, for no reason the
user could see.

The fix is a **scale-free Tikhonov anchor** toward the quantities the plan
already holds:

```
minimise  ‖W(A·q − t)‖² + Σⱼ λⱼ (qⱼ − rⱼ)²      subject to  lo ≤ q ≤ hi
λⱼ = ρ · Σᵢ wᵢ A[i][j]²      (ρ = 1e-3 by default)
```

Scaling λⱼ off column *j*'s own weight is what makes ρ a dimensionless knob:
olive oil (100 g fat per 100 g) and broccoli (4 g carb per 100 g) get anchor
terms proportional to their own influence, so one ρ works for every food. That
buys three things at once: a **unique** minimiser, an answer that is
**continuous** in the inputs, and — since the anchor points at the plan's current
numbers — the member of the solution family **closest to what the user wrote**.
The cost is negligible: the same 3×5 problem now lands within `1e-4` of the same
answer from either start, with a worst-macro residual under 0.05 g.

Convergence itself took two rewrites:

| Algorithm | Iterations, 15 foods | Iterations, 30 foods |
| --- | --- | --- |
| Cyclic coordinate descent | ~5,300 | — |
| Projected Newton, clamped line search | 117 | 502 |
| **Active-set (BVLS) Newton + CD safety net** | **2** | **2** |

Coordinate descent is the wrong algorithm for this shape: anchored flat valleys
are exactly what it crawls along. Naive projected Newton is *also* wrong, and
that one is a trap — it looks correct and it is not. A variable sitting near but
not exactly on a bound counts as free, the Newton direction overshoots it,
clamping mangles the step, and the line search collapses into steps too small to
matter. Measured, not guessed: at 15 foods the solve was still genuinely
descending at the iteration cap (objective 10.458 at iteration 100, 9.6516 when
finally converged at 117).

What works is a **Lawson–Hanson / BVLS active set** (`newton()` in
`boundedLeastSquares.ts`): solve exactly on the free set by dense Cholesky, and
if the exact answer leaves the box, park the *worst* violator on the bound it
crossed, mark it fixed, and re-solve — at most *n* rounds. An exact cyclic
coordinate sweep runs alongside it as a monotone safety net, and the Newton step
is accepted only if it actually lowers the objective, so the method cannot do
worse than coordinate descent on a problem where the Hessian misleads it.

One more correction that matters: **step size is the wrong stopping criterion**
for an active-set method, which can take a tiny step and then a large one.
Convergence is declared on the **KKT residual** — the worst gradient magnitude
over variables not legitimately pressed against a bound — relative to
`tolerance · max(1, ‖b‖∞)`. Variables nothing in the objective depends on (a
food with all-zero macros, so a zero Hessian diagonal) are unidentifiable and
frozen at their reference rather than left to drift.

### Is it fast enough to run on every input change in the browser? Target < 50 ms.

Comfortably. Measured on the 15-food TACO-shaped fixture, averaged over repeated
solves (`macroSolver.test.ts`, "solves N foods well inside the 50 ms
input-change budget"):

| Foods | ms / solve | Iterations | Budget |
| --- | --- | --- | --- |
| 5 | 0.03–0.06 | 2 | 50 ms |
| 10 | 0.03–0.10 | 1 | 50 ms |
| 15 | 0.08–0.16 | 2 | 50 ms |
| 30 | 0.22–0.51 | 2 | 50 ms |

Ranges, not single figures, because a solver benchmark run alongside the rest of
the suite competes for cores — the low end is `vitest run src/lib/solver/` on its
own, the high end is `npm test`. Iteration counts are identical either way, which
is the part that is actually a property of the algorithm.

Even the pessimistic end is **two to three orders of magnitude** inside the
budget, and 30 foods — past any plausible meal — costs half a millisecond at
worst. No debouncing, no worker, no incremental solve. The test asserts
both the timing **and** `converged === true`, because a fast answer the solver
had not actually settled on is the worse of the two failures.

### Which library — or is a small projected-gradient implementation simpler than a dependency?

**No library.** `src/lib/solver/boundedLeastSquares.ts` is pure arithmetic with
zero imports, and `macroSolver.ts` imports one *type*. Reasons, in order of
weight:

1. **The math is small.** Normal equations, a dense Cholesky on at most a few
   dozen variables, and an active-set loop. At n ≤ 30 there is nothing for BLAS
   to win — the whole matrix fits in cache and the constant factors of a generic
   library would dominate.
2. **The domain rules live in the objective.** Weights, the anchor, per-food
   bounds, unidentifiable columns, honest residual reporting — a general QP
   package would need all of that bolted on around it anyway.
3. **This is an offline-first PWA.** Every dependency is bytes in the service
   worker cache on a Brazilian mobile connection, and this one would be a solver
   with an entire dense-linear-algebra layer attached.
4. **It has to be debuggable in five years.** When a user reports "the portions
   look wrong", the answer has to be readable in this repo.

The projected-gradient implementation the issue proposes is what we tried first
and it is *not* adequate — see the table above. The replacement is barely larger
and vastly better behaved.

### How are infeasible targets surfaced (residual reporting) rather than silently mis-solved?

Three layers, all in `MacroSolution`:

- **`residual`** — per macro, `achieved − target`, signed. Positive is over. Not
  a norm, not a score: grams of protein, carbs and fat, plus kcal when an energy
  target was given.
- **`feasible`** — `false` when any macro misses by more than `toleranceG`
  (default 2 g). A boolean the UI can branch on without re-deriving the rule.
- **`limiting`** — the honest answer to *"why is protein still 82 g short?"*.
  Foods pressed against a bound **in the direction that would have closed the
  gap**, so the UI can name them. Not "the solver failed"; "chicken, broccoli and
  whey are all at their maximum."

Measured on a deliberately impossible ask — 200 g protein from at most 200 g
chicken, 300 g broccoli and 60 g whey:

```
feasible: false
residual: protein −81.7 g, carb −42.0 g, fat −29.9 g
limiting: frango@max (200 g), brocolis@max (300 g), whey@max (60 g)
```

The gap is *reported*, never absorbed. A bound is never quietly relaxed to make
the numbers look better, and `converged` is reported separately from `feasible`
— "the solver finished" and "the target is reachable" are different facts and
the UI needs both.

---

## What this replaces

The comparison is in the tests rather than in prose:
`naiveSingleMacroPlan()` in `macroSolver.test.ts` reimplements the predecessor's
algorithm — scale the carb option against the carb gap and the protein option
against the protein gap, both computed up front from mandatory items only, then
fill fat with a vehicle. On the breakfast fixture (200 g milk mandatory, oats
20–150 g, whey 0–60 g, olive oil 0–30 g; targets 45 P / 75 C / 20 F):

| | protein | carb | fat |
| --- | --- | --- | --- |
| Target | 45.0 | 75.0 | 20.0 |
| Predecessor | 58.7 (**+13.7**) | 78.9 (+3.9) | 20.0 (+0.0) |
| Joint solve | 45.4 (+0.41) | 75.3 (+0.31) | 20.5 (+0.45) |

That is Cause 3 from MACRO-RECONCILIATION.md, exactly as documented: fat lands
on target because it is scaled last against whatever is left, while protein runs
14 g over because oats and milk carry protein that the protein scaler never
credited. The joint solve is inside half a gram on all three.

And the fat vehicle is gone as a concept. It was never a nutritional idea, only a
consequence of solving one macro at a time; a fat vehicle is just a food whose
composition column is (0, 0, 1) with a wide bound. Mandatory items are foods with
`minG === maxG`. Day-level pooling disappears because all three macros are
balanced at once instead of one after another.

## One defect found along the way

Rounding to whole grams moves the anchor, and along a flat direction the optimum
follows the anchor almost one-for-one. So plain "round at the end" meant that
**merely reopening a solved plan drifted it** — broccoli 195 g became 194 g,
then 193 g, with the user having changed nothing. A real bug, found only because
there is a test that solves a plan twice.

The fix is reference-preferring rounding with the tie broken **in grams of
macro, not grams of food**: the plan's own number wins when keeping it costs at
most half a gram of any macro, and never moves a food by more than one rounding
step. Broccoli's densest macro is 0.044 g/g, so it gets the full step of room;
olive oil is 1.0 g/g, so it gets 0.5 g. `solveMacros` is now an exact fixed
point from the first solve onward, with no accuracy given up for it.

The other half of the same lesson from MACRO-RECONCILIATION.md §5 — *render from
the computed value, never the stored value* — shows up as ordering: `achieved` is
accumulated from the **rounded** quantities, so the totals shown are the totals
of the numbers the user will actually weigh out.

## Consequences for P2

- The builder solves per meal on every input change, synchronously. No
  debouncing, no worker, no loading state.
- `SolverFood.quantityG` is load-bearing, not decoration. It is the anchor, and
  it is why editing a target nudges portions instead of reshuffling the meal.
- The UI needs a place to show `residual` and `limiting`. An unreachable target
  is a normal state, not an error state.
- Fat vehicles do not exist in the data model.
