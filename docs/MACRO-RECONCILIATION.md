# Macro reconciliation — prior art and the target design

> Carried over from the predecessor Streamlit app
> ([diet_calculator_app](https://github.com/jacksonsieben/diet_calculator_app)).
> This documents the **algorithm**, not the Python, so it can be reimplemented
> here. Reference implementation: `macros.py` (`build_meal_plan`,
> `_apply_fat_pass`, `_build_fixed_display`).
>
> **Read the last section first if you are implementing the DietKit builder.**
> The approach described in sections 1–5 is a workaround that DietKit should
> replace, not reproduce.

## The problem

A meal is built by scaling a *carb option* and a *protein option* until each
hits its per-meal gram target. That leaves three ways for the day's totals to
drift away from the targets shown to the user:

1. **Fat was never scaled.** Only carbs and protein had a scaler. Fat was
   whatever came along for the ride, and it landed ~40 g short.
2. **Mandatory items were never credited.** Every meal carries mandatory items
   (vegetables, milk, olive oil, supplements). Their macros were shown to the
   user but not subtracted from the meal's target before scaling, so the
   scalable options were sized to cover 100% of a target that was already partly
   covered.
3. **Cross-macro contributions were never credited.** Carb options carry protein
   (bread, milk, oats) and protein options carry carbs (whey + milk). Scaling
   each to hit its *own* macro necessarily overshoots the other.

Causes 1 and 2 were fixed in the predecessor. **Cause 3 was not** — see the
final section.

## 1. Credit mandatory items against the meal target

Before any scaling:

```
carb_scaling_target = max(0, meal_target.carb    − fixed_always.carb)
prot_scaling_target = max(0, meal_target.protein − fixed_always.protein)
```

The fat vehicle (below) is *excluded* from this sum, because its quantity is not
known yet. The `max(0, …)` matters: a meal whose fixed items already exceed its
carb target clamps to zero rather than producing a negative portion, and the UI
surfaces that as a warning instead of silently going negative.

Both the total target and the post-credit scaling target are retained on the meal
object — **the user is shown the total, the scaler consumes the reduced one.**

## 2. Pick a macro-pure fat vehicle

Closing a fat gap with a mixed food would re-break the protein and carb totals
that were just balanced. Olive oil is 0 g protein / 0 g carb / 100 g fat per
100 g, so its quantity is a free variable: moving it changes fat and nothing
else. Any macro-pure food works; the constant is a single knob
(`FAT_VEHICLE_KEY`).

Only *some* meals carry a fat vehicle. So the fat gap cannot be closed
meal-by-meal — a meal without a vehicle has no way to fix its own shortfall.

## 3. Two-pass pooling and redistribution

Hence a day-level pass, run *after* every meal's options are sized:

- **Pass A (measure):** for each meal, compute
  `gap = fat_target − (selected carb option fat + selected protein option fat + fixed_always fat)`.
  Sum the gaps into one day-level pool. Meals that overshoot contribute a
  negative gap, which correctly shrinks the pool.
- **Pass B (place):** distribute the pool across only the vehicle-carrying meals,
  **proportionally to those meals' fat targets**. Proportional rather than equal
  split keeps the day's fat shape intact — the big dinner still gets more oil
  than the mid-day meal.

## 4. Clamp and report the residual

Per-meal oil is capped (`MAX_FAT_VEHICLE_G = 45 g`), because an uncapped solver
will happily prescribe 110 ml of olive oil in one sitting for a high-fat
coefficient. Anything the cap refuses is kept as `fat_residual_g` rather than
discarded — it is an honest "couldn't place this much" signal for the UI, not a
rounding error. Quantities round to 1 g/ml, since nobody measures oil to a
decimal.

## 5. Render from the computed value, never the stored value

The raw food database says a meal has 5 ml of olive oil; the fat pass may compute
23 ml. If the UI renders the stored entry, the printed plan contradicts the
totals directly below it. So the pass emits a **display list** — the mandatory
entries with the vehicle's quantity replaced by the computed one — and *every*
consumer (screen, PDF, export) renders from that list.

**This is the single most portable lesson here: a computed quantity must have
exactly one source of truth, and the view must read it.**

### Selection-dependence

The fat pass depends on *which* carb/protein options are currently selected,
since different options carry different amounts of fat. So option indices are an
input to the plan builder, and any consumer that recomputes totals (daily
summary, export) must pass the *same* indices or it will report numbers the user
never saw.

---

## What DietKit should do instead

Each option above is still scaled against a single macro in isolation, so the
cross-macro carry-over (cause 3) stays uncredited. In practice the predecessor
lands **on target for fat** and roughly **+20–30 g over on both protein and
carbs** — a few hundred kcal above the caloric goal.

Fixing it properly requires a **joint solve**: all three macros simultaneously,
as bounded least-squares over the food quantities

```
minimise  ‖ A·q − t ‖²
subject to  lo ≤ q ≤ hi
```

where `q` is the vector of food quantities, `A` maps quantities to macro grams
(the food composition matrix), `t` is the per-meal or per-day macro target
vector, and `lo`/`hi` are per-food portion bounds.

This subsumes everything in sections 2–4 entirely. The fat vehicle stops being a
special case and becomes just one more free variable with a wide bound; the
pooling and redistribution logic disappears; mandatory items become fixed terms
moved to the right-hand side.

**Do the joint solve first.** It is scheduled as a P0 spike specifically so the
diet builder is never committed to the single-macro design.
