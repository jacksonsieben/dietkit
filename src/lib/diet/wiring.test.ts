import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";

import { GROUP_ERROR_CODES, GROUP_LIMITS } from "./groups";
import { ITEM_ERROR_CODES, ITEM_LIMITS } from "./items";
import { MEAL_ERROR_CODES, MEAL_LIMITS } from "./meals";
import { OPTION_ERROR_CODES } from "./options";
import { RECONCILE_MACROS, TOLERANCE } from "./reconcile";
import { ATWATER } from "@/lib/energy/macros";
import { DEFAULT_TOLERANCE_G } from "@/lib/solver/macroSolver";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #18 that are true about how the screen is wired rather than
 * about what the arithmetic computes. The shares and the apportionment have
 * their own tests; what is left only shows up in the source — that the screen
 * uses those functions instead of reimplementing the split, and that the four
 * verbs the issue asks for are all reachable from it.
 *
 * Read rather than rendered, for the reason `src/lib/profile/wiring.test.ts`
 * gives: next-intl resolves to its client build under Vitest and a server
 * component throws before it paints.
 */
describe("meal planner wiring", () => {
  const component = () => read("src/components/MealPlanner.tsx");

  it("offers all four verbs the issue asks for", () => {
    // Add, remove, rename, reorder. A screen that can only add is the failure
    // mode here, because it still looks like it satisfies "user-defined".
    const source = component();

    for (const verb of [
      "addMeal(",
      "removeMeal(",
      "renameMeal(",
      "moveMeal(",
    ]) {
      expect(source).toContain(verb);
    }
  });

  it("lets the split be adjusted rather than only evened out", () => {
    // `evenShares` alone would be the predecessor's behaviour with a nicer
    // list: the point of #18 is that lunch can be bigger than breakfast.
    const source = component();

    expect(source).toContain("setShare(");
    expect(source).toContain("checkSharePercent(");
  });

  it("divides the targets with the module that keeps the total honest", () => {
    // The screen must not do its own `targets.proteinG * share` — that is the
    // rounding bug `distributeTargets` exists to prevent, and it would be
    // invisible in every screenshot.
    const source = component();

    expect(source).toContain("distributeTargets(");
    expect(source).toContain("sharePercents(");
    expect(source).not.toMatch(/proteinG\s*\*/);
  });

  it("reads the targets from the profile instead of asking for them again", () => {
    // The day's numbers are already an answered question (#15). A second box
    // asking for kilocalories here is two places to disagree about the target.
    const source = component();

    expect(source).toContain("loadEnergySummary(");
    expect(source).toContain("planMacros(");
  });

  it("divides the day from the plan's own targets, not from today's", () => {
    // #25's hinge. Recomputing on every visit made a saved plan quietly change
    // shape whenever the scale did, with nothing on screen to say when or why —
    // and the meals underneath were still divided from the old numbers.
    const source = component();

    expect(source).toContain("const targets = loaded.plan.targets");
    expect(source).toContain("distributeTargets(targets, meals)");
    expect(source).toContain("solvePlan(targets, meals, book)");
  });

  it("does not overwrite the saved targets on the next save", () => {
    // The save writes the plan as it stands. Re-stating the targets here is how
    // the recompute used to leak back into the store.
    const source = component();
    const submit = source.slice(source.indexOf("const onSubmit"));
    const write = submit.slice(0, submit.indexOf("setDirty(false)"));

    expect(write).not.toContain("targets: loaded.current.targets");
    expect(write).not.toContain("basedOnWeightKg:");
  });

  it("offers today's numbers rather than applying them", () => {
    const source = component();

    // The whole profile, not just the scale (#126): a screen that asked
    // `weightDrift` here would go on missing every plan that fell behind
    // because the goal changed under it.
    expect(source).toContain("planDrift(loaded.plan, loaded.current)");
    expect(source).not.toContain("weightDrift(");
    // The rebuild happens because a button was pressed, not because the screen
    // was opened: no effect and no render-time call may reach `rebasePlan`.
    expect(source).toContain("onClick={rebase}");
    expect(source.match(/rebasePlan\(/g)).toHaveLength(1);
  });

  it("offers the per-type ceilings rather than applying them (#D)", () => {
    // Same rule as the weight above, for the same reason: a maximum is the one
    // number that decides what the solver may do, so no effect and no
    // render-time call may reach `tightenCeilings`.
    const source = component();

    expect(source).toContain("looseCeilings(meals)");
    expect(source).toContain("onClick={tighten}");
    expect(source.match(/tightenCeilings\(/g)).toHaveLength(1);
    // And the sentence has to say the number the rows are actually sitting at.
    expect(ptBR.Plan.looseCeilings).toContain("{max, number}");
  });

  it("rebuilds without asking for the profile again", () => {
    // The issue's second bullet: one action. The handler recomputes from what
    // is already loaded and never sends the user to /perfil to change a number.
    const source = component();
    const handler = source.slice(source.indexOf("const rebase = ()"));
    const body = handler.slice(0, handler.indexOf("const onSubmit"));

    expect(body).toContain("state.current.targets");
    expect(body).toContain("state.current.weightKg");
    expect(body).not.toContain("/perfil");
    expect(body).not.toContain("savePlan");
  });

  it("says which body the plan was written for", () => {
    // "Old plans stay interpretable" is the third bullet, and it is this line:
    // 2 100 kcal means nothing a year later without the weight beside it.
    expect(component()).toContain("planKnowsItsWeight(loaded.plan)");
    expect(ptBR.Plan.basedOn).toContain("{weight, number}");
  });

  it("names the direction the weight moved, not just the size of the gap", () => {
    for (const message of [ptBR.Plan.driftUp, ptBR.Plan.driftDown]) {
      expect(message).toContain("{from, number}");
      expect(message).toContain("{to, number}");
    }

    // Two messages rather than one with a signed number in it: Portuguese needs
    // different words for the two, and "-3 kg" is not a sentence.
    expect(ptBR.Plan.driftUp).not.toBe(ptBR.Plan.driftDown);
  });

  it("names the macros when the goal is what moved, not the weight", () => {
    // #126's sentence: with the scale unchanged there is no "you weighed X"
    // to lead with, so the banner has to say what the targets are now --
    // otherwise it announces that something changed and never says what.
    for (const token of [
      "{protein, number}",
      "{carb, number}",
      "{fat, number}",
    ]) {
      expect(ptBR.Plan.driftTargets).toContain(token);
    }

    expect(ptBR.Plan.driftTargets).not.toBe(ptBR.Plan.driftUp);
  });

  it("puts the weight it would use on the button", () => {
    // A button labelled only "Recalcular" asks the user to trust that the app
    // knows which number it means.
    expect(ptBR.Plan.rebase).toContain("{weight, number}");
  });

  it("does not create a stored plan just because the screen was opened", () => {
    const source = component();

    expect(source).toContain("newPlan(");
    // The only write, and it is behind the submit handler.
    expect(source.match(/savePlan\(/g)).toHaveLength(1);
  });

  it("has a message for every error the meal rules can produce", () => {
    // The screen renders `t(\`errors.${code}\`)`, so a code with no message is
    // a runtime failure on the one screen that is meant to be explaining what
    // went wrong.
    expect(Object.keys(ptBR.Plan.errors).sort()).toEqual(
      [...MEAL_ERROR_CODES].sort(),
    );
  });

  it("counts meals in a plural the catalogue can express", () => {
    expect(ptBR.Plan.mealCount).toContain("plural");
  });

  it("quotes the real ceiling rather than a number typed into the sentence", () => {
    // "no máximo 12" written by hand is a sentence that keeps saying 12 after
    // the limit moves.
    expect(component()).toContain("MEAL_LIMITS.count.max");
    expect(ptBR.Plan.addLimit).toContain("{max, number}");
    expect(MEAL_LIMITS.count.max).toBeGreaterThan(MEAL_LIMITS.count.min);
  });
});

/**
 * The same kind of check for #19: the parts that are true about the wiring
 * rather than about the arithmetic. `solve.test.ts` proves the three macros are
 * solved at once and that a mandatory item is credited; what only the source
 * can show is that the screen calls that solver instead of growing its own
 * scaling pass beside it.
 */
describe("meal item wiring", () => {
  const planner = () => read("src/components/MealPlanner.tsx");
  const items = () => read("src/components/MealItems.tsx");
  const picker = () => read("src/components/FoodPicker.tsx");
  const panel = () => read("src/components/MacroPanel.tsx");

  it("solves the quantities instead of asking for them", () => {
    const source = planner();

    expect(source).toContain("solvePlan(");
    expect(source).toContain("buildFoodBook(");
  });

  it("stores the quantities that were solved, not the ones from before", () => {
    // Saving the pre-solve quantities is the bug that makes a plan reopen
    // showing different portions from the ones on screen when it was saved.
    const source = planner();

    expect(source).toContain("applySolution(");
    expect(source.indexOf("applySolution(")).toBeLessThan(
      source.indexOf("savePlan("),
    );
  });

  it("carries only the compositions the plan still points at", () => {
    // Otherwise every food ever tried accumulates in a store the user cannot
    // see, and the export in #26 is the only backup they have.
    expect(planner()).toContain("usedTacoFoods(");
  });

  it("refuses a TACO row whose macros were never published", () => {
    // `numericValue` would read those cells as 0, which is the silent
    // mis-solve #19 exists to rule out — see `compositionFromResult`.
    expect(picker()).toContain("compositionFromResult(");
  });

  it("asks the food question the way /alimentos asks it", () => {
    // Its own fetch, but not its own parser or its own debounce: a picker that
    // searched by different rules would find foods the food screen cannot.
    const source = picker();

    expect(source).toContain("parseFoodQuery(");
    expect(source).toContain("SEARCH_DEBOUNCE_MS");
    expect(source).toContain("mergeListings(");
    expect(source).toContain("searchCustomFoods(");
  });

  it("shows the shortfall rather than only the numbers that worked out", () => {
    // "Infeasible targets reported as a residual, never silently mis-solved."
    // The residual reaches the screen through the reconciliation panel (#21),
    // which prints target, plan and the difference between them.
    const source = items();

    expect(source).toContain("reconcileMeal(");
    expect(source).toContain("limiting");
    expect(panel()).toContain("line.delta");
  });

  it("has a message for every error the item rules can produce", () => {
    // Separate from `Plan.errors`, which the meal test above pins to
    // `MEAL_ERROR_CODES` exactly.
    expect(Object.keys(ptBR.Plan.itemErrors).sort()).toEqual(
      [...ITEM_ERROR_CODES].sort(),
    );
  });

  it("names every macro it can report a shortfall in", () => {
    expect(Object.keys(ptBR.Plan.macroName).sort()).toEqual(
      [...RECONCILE_MACROS].sort(),
    );
  });

  it("quotes the real item ceiling rather than a number typed into it", () => {
    expect(items()).toContain("ITEM_LIMITS.count.max");
    expect(ptBR.Plan.itemLimit).toContain("{max, number}");
    expect(ITEM_LIMITS.gramsG.max).toBeGreaterThan(ITEM_LIMITS.gramsG.min);
  });

  it("has no fat vehicle", () => {
    // The predecessor sized one designated fatty food in a pass of its own
    // after the others (docs/MACRO-RECONCILIATION.md § 3). #19 is explicit that
    // it "does not exist — it is just another free variable with a wide bound",
    // and a special case would reappear here first.
    for (const source of [planner(), items(), read("src/lib/diet/solve.ts")]) {
      expect(source).not.toMatch(/fatVehicle|fat_vehicle|veiculoDeGordura/i);
    }
  });
});

/**
 * #20, whose "done when" is three sentences about behaviour: a slot can hold a
 * group, swapping re-solves, and the groups are user-definable. The first two
 * are proved in `groups.test.ts` and `solve.test.ts`; what only the source can
 * show is that the screens use those functions — and, for the third, that no
 * list of fruits is written down anywhere.
 */
describe("substitution group wiring", () => {
  const manager = () => read("src/components/SubstitutionGroupManager.tsx");
  const planner = () => read("src/components/MealPlanner.tsx");
  const items = () => read("src/components/MealItems.tsx");

  it("lets a slot hold a group and swap within it", () => {
    const source = items();

    expect(source).toContain("groupsForFood(");
    expect(source).toContain("alternativesFor(");
    expect(source).toContain("onSetGroup");
    expect(source).toContain("onSwap");
  });

  it("re-solves after a swap instead of carrying the old quantity over", () => {
    // `swapFood` replaces the food and nothing else; the quantity on screen is
    // whatever the render-time `solvePlan` chose for the new one. A planner
    // that wrote a quantity here would be the predecessor's fruit swap again.
    const source = planner();

    expect(source).toContain("swapFood(");
    expect(source).toContain("setItemGroup(");
    expect(source.indexOf("solvePlan(")).toBeGreaterThan(0);
    expect(source).not.toMatch(/swapFood\([^)]*quantityG/);
  });

  it("can price an alternative the plan is not using yet", () => {
    // The whole point of a group is foods that are *not* on the plate. Their
    // numbers are in no other store on this device, so the book has to take
    // the groups' own snapshots or the first swap of the day needs a network.
    expect(planner()).toContain("groupCompositions(");
  });

  it("builds the groups from the user's own choices", () => {
    const source = manager();

    expect(source).toContain("validateGroup(");
    expect(source).toContain("saveGroup(");
    expect(source).toContain("deleteGroup(");
    // The same picker the meal uses: a food choosable in one place and not the
    // other would make a group that cannot be applied.
    expect(source).toContain("FoodPicker");
  });

  it("ships no built-in group", () => {
    // "Groups are user-definable, not a fixed built-in list." The predecessor's
    // hardcoded fruit list is the thing this issue exists to delete, and it
    // would come back as a seed array long before it came back as a feature.
    for (const source of [manager(), items(), read("src/lib/diet/groups.ts")]) {
      expect(source).not.toMatch(/DEFAULT_GROUPS|BUILT_IN_GROUPS|FRUIT_GROUP/i);
      // A shipped group would have to name its members, and the only way to
      // name a TACO food in code is by id.
      expect(source).not.toMatch(/tacoId:\s*\d/);
    }
  });

  it("has a message for every error the group rules can produce", () => {
    expect(Object.keys(ptBR.Groups.errors).sort()).toEqual(
      [...GROUP_ERROR_CODES].sort(),
    );
  });

  it("quotes the real group limits rather than numbers typed into sentences", () => {
    const source = manager();

    expect(source).toContain("GROUP_LIMITS.count.max");
    expect(source).toContain("GROUP_LIMITS.foods.min");
    expect(ptBR.Groups.addLimit).toContain("{max, number}");
    expect(ptBR.Groups.foodsHint).toContain("{min, number}");
    expect(GROUP_LIMITS.foods.min).toBeLessThan(GROUP_LIMITS.foods.max);
  });
});

/**
 * #21, which is four claims about a screen rather than about a calculation:
 * every macro shows target, actual and delta; the panel is always on screen;
 * off-target is legible as off-target; and the numbers come from the values the
 * plan already rendered rather than from a second computation.
 */
describe("reconciliation panel wiring", () => {
  const planner = () => read("src/components/MealPlanner.tsx");
  const items = () => read("src/components/MealItems.tsx");
  const panel = () => read("src/components/MacroPanel.tsx");

  it("shows target, actual and delta for the day and for each meal", () => {
    expect(planner()).toContain("reconcileDay(solved)");
    expect(items()).toContain("reconcileMeal(solved)");

    const source = panel();
    for (const column of ["line.target", "line.actual", "line.delta"]) {
      expect(source).toContain(column);
    }
  });

  it("reports energy as well as the three macros", () => {
    // The day's kcal is what someone checks first, and a panel that reconciled
    // only the grams would leave the headline number unaccounted for.
    expect([...RECONCILE_MACROS]).toContain("kcal");
    expect(Object.keys(ptBR.Plan.macroName)).toContain("kcal");
  });

  it("is not behind a tab, a toggle or a disclosure", () => {
    // "Always visible while editing." The panel has no open state of its own,
    // and neither call site wraps it in one.
    const source = panel();

    expect(source).not.toContain("useState");
    expect(source).not.toMatch(/<details|<summary|aria-expanded/);

    for (const caller of [planner(), items()]) {
      expect(caller).not.toMatch(/\{\s*show\w*\s*&&\s*<MacroPanel/);
      expect(caller).not.toMatch(/\?\s*<MacroPanel/);
    }
  });

  it("says off-target in more than a colour", () => {
    // Amber text alone is nothing to a screen reader and not much to someone
    // who does not see the difference between amber and grey.
    const source = panel();

    expect(source).toContain("reconcile.state.");
    expect(Object.keys(ptBR.Plan.reconcile.state).sort()).toEqual([
      "over",
      "under",
    ]);
  });

  it("subtracts the numbers it printed", () => {
    // The carried-over lesson in docs/MACRO-RECONCILIATION.md § 5: a computed
    // quantity has one source of truth and the view reads it. Rounding lives in
    // `reconcile.ts` so the delta column is the difference between the two
    // columns beside it, not between the values behind them.
    const source = panel();

    expect(source).not.toContain("Math.round");
    expect(source).not.toContain("- line.target");
  });

  it("agrees with the solver about what counts as met", () => {
    // One tolerance, shared rather than restated. A panel with its own idea of
    // "close enough" would call a meal short that the solver had already
    // called solved, and the user would have two apps disagreeing in one page.
    expect(TOLERANCE.gramsG).toBe(DEFAULT_TOLERANCE_G);

    // Energy is judged by what that same gram band is worth at 4/4/9, because
    // kcal is never solved for directly — holding it to a couple of
    // kilocalories would flag every plan the solver is content with.
    expect(TOLERANCE.kcal).toBe(
      DEFAULT_TOLERANCE_G *
        (ATWATER.proteinKcalPerG + ATWATER.carbKcalPerG + ATWATER.fatKcalPerG),
    );
  });

  it("does not keep a second copy of the totals", () => {
    // The planner solves during render and hands the same array to both the
    // rows and the panel. A `useState` holding totals would be the predecessor's
    // bug with better types.
    expect(planner()).not.toMatch(/useState[^;]*[Tt]otals/);
    expect(planner()).toContain("reconcileDay(solved)");
  });
});

/**
 * The parts of #111 and #H that live in the screen rather than in `options.ts`:
 * that the planner writes through the option functions instead of reaching into
 * `optionSets` itself, that only the selected version is drawn, and that the
 * limits and errors on screen are the ones the module publishes.
 */
describe("meal version wiring", () => {
  const planner = () => read("src/components/MealPlanner.tsx");
  const items = () => read("src/components/MealItems.tsx");

  it("draws the rows of the option that is selected", () => {
    const source = items();

    expect(source).toContain("selectedOption(");
    expect(source).toContain("optionSetsOf(");
  });

  it("never draws grams for an option nobody picked", () => {
    // `allItems` is the TACO snapshot's view — everything the plan mentions,
    // including the alternatives. Anything on this screen that priced a row
    // from it would be printing a portion the solver never chose.
    for (const source of [planner(), items()]) {
      expect(source).not.toContain("allItems(");
    }
  });

  it("adds a food to the container it was asked about", () => {
    // Without the `optionId`, every add lands in the meal's fixed rows and the
    // option the user was editing silently stays empty.
    expect(planner()).toContain(
      "addItem(current.plan.meals, mealId, item, optionId)",
    );
    expect(items()).toContain("canAddTo(");
  });

  it("counts rows against the container's limit, not the meal's", () => {
    expect(planner()).toContain("canAddItem(meal, optionId)");
  });

  it("stores the choice on the plan rather than in the screen's state", () => {
    // A selection held in `useState` would reset to the first option every time
    // the app is reopened, which is the plan quietly changing what it says.
    const source = items();

    expect(source).toContain('type="radio"');
    expect(source).toContain("actions.onSelectOption(");
    expect(planner()).toContain("selectOption(");
  });

  it("reaches every option verb the issue asks for", () => {
    const source = planner();

    for (const verb of [
      "startOptions(",
      "addOption(",
      "removeOption(",
      "renameOption(",
      "selectOption(",
    ]) {
      expect(source, `missing ${verb}`).toContain(verb);
    }
  });

  it("starts versions from the meal that is already there (#H)", () => {
    // Not from an empty set with two empty options: the button says "this
    // breakfast has another form", and it has to have a breakfast to say it
    // about. The screen gates on the rows, the module moves them.
    expect(items()).toContain("meal.items.length > 0");
    expect(planner()).not.toContain("newOptionSet");
  });

  it("asks before deleting a version, in the page rather than in a dialog", () => {
    // Deleting a version deletes rows the user typed, and deleting the
    // second-to-last one ends the choice as well. `window.confirm` would also
    // freeze the page for anything driving the browser, so the confirmation is
    // two buttons where the delete was.
    const source = items();

    expect(source).toContain("options.removeWarning");
    expect(source).toContain("options.removeLast");
    expect(source).not.toMatch(/window\.confirm|\bconfirm\(/);
  });

  it("names a version after its food when nobody named it (#H)", () => {
    // The chips are the whole redesign: "Pão + ovo" is a choice somebody can
    // make, "Opção 1" is a question about what the app wants.
    const source = items();

    expect(source).toContain("optionSignature(");
    expect(planner()).not.toContain("options.newOptionName");
  });

  it("quotes the real option limits rather than numbers typed into a sentence", () => {
    expect(items()).toContain("OPTION_LIMITS.options.max");
    expect(ptBR.Plan.options.limit).toContain("{max, number}");
  });

  it("has a message for every error the option rules can produce", () => {
    expect(Object.keys(ptBR.Plan.options.errors).sort()).toEqual(
      [...OPTION_ERROR_CODES].sort(),
    );
  });

  it("will not save a version name longer than its chip", () => {
    // And stores the names trimmed, like every other name here. An empty one
    // is not an error any more (#H) — it is a version named after its food.
    const source = planner();

    expect(source).toContain("checkMealOptions(");
    expect(source).toContain("trimOptionNames(");
  });
});
