import { ITEM_LIMITS, newItem } from "@/lib/diet/items";
import { newPlan } from "@/lib/diet/plan";
import { GROUP_LIMITS } from "@/lib/diet/groups";
import { OPTION_LIMITS, allItems, checkOptionName } from "@/lib/diet/options";
import { macroEnergy, planMacros } from "@/lib/energy/macros";
import { deriveKcal } from "@/lib/foods/custom";
import type {
  CustomFood,
  Diet,
  DietItem,
  DietOption,
  FoodComposition,
  FoodRef,
  Id,
  IsoTimestamp,
  MacroGoal,
  Meal,
  OptionSet,
  SubstitutionGroup,
} from "@/lib/storage/types";

import type {
  Catalogue,
  CatalogueFood,
  CatalogueItem,
  CatalogueMacro,
  CatalogueOption,
  DayType,
} from "./catalogue";
import { CATALOGUE_MACROS } from "./catalogue";
import { mappingFor } from "./foodMap";
import type { PredecessorProfile } from "./profile";

/**
 * The predecessor's profile, turned into this app's records (#22).
 *
 * `profile.ts` reads the file and `foodMap.ts` says which TACO row each of the
 * old app's foods is; this is where the two meet a data model that was designed
 * after them and does not match. Most of the work here is that mismatch, and
 * the rule throughout is the issue's own: *unmapped items are reported, not
 * silently dropped*. Every approximation below leaves a `ImportNote` behind, so
 * the screen can show a list of what changed rather than a green tick.
 *
 * The five that are worth stating up front, because they are decisions rather
 * than arithmetic:
 *
 * - **Only the training day is imported.** The predecessor kept two plans, a
 *   `treino` and a `descanso` day with its own carbohydrate cut. DietKit has
 *   one plan per record — plural plans, but no notion of "the other version of
 *   this one" — so the rest day would have to arrive as a second diet with a
 *   silent relationship to the first. It is reported as not imported instead;
 *   nothing stops the user importing again and editing.
 * - **One share per meal, not one per macro.** The old app split each macro
 *   across the meals separately: breakfast could carry 40% of the day's
 *   carbohydrate and 10% of its fat. A `Meal.share` is a single fraction of the
 *   whole day (#18), so the three splits collapse into the energy-weighted one
 *   and the largest deviation that costs is reported in percentage points.
 * - **The file brings the food; this device brings the numbers** (#123). This
 *   reverses the decision that stood here, and the reversal is the point, so
 *   the old one is written out rather than deleted: the predecessor derived
 *   grams from g/kg coefficients and separately showed a TDEE-based target,
 *   knew the two disagreed — its `MacroTotals` has a `delta_kcal` for exactly
 *   that — and the import used to keep the coefficients, because they were what
 *   the portions on the plate had been sized by, and report the gap. That was
 *   right while an import was a *record* of an old plan. It is wrong now that
 *   it is how someone starts using this app: the files people still have are
 *   years old, the weight and the age in them are stale, and a plan built on
 *   them looks authoritative and is not. So `Diet.targets` comes from the
 *   device's own profile, weight and goal, down the chain every other plan
 *   uses — `basalMetabolicRate` → `totalDailyEnergyExpenditure` → `planMacros`,
 *   the same numbers `/energia` shows — and the import writes nothing personal
 *   at all: no profile, no weighing, no goal. A device with none of those to
 *   compute from is refused rather than quietly falling back to the file's
 *   figures, which would reinstate the very numbers this decision distrusts.
 * - **A food TACO does not publish becomes a custom food** with the old app's
 *   own numbers, which is what `CUSTOM_REASONS` in `foodMap.ts` enumerates.
 * - **Both decisions in a meal come across, as decisions** (#122). The old app
 *   asks which carbohydrate and which protein; both lists arrive as option
 *   sets, with the stored index selecting one. Importing only the two selected
 *   options was a plan that could not be re-decided.
 *
 * Pure: ids and timestamps arrive as arguments, and the TACO compositions are
 * handed in by the caller — this module never fetches. `neededTacoIds` says
 * which rows to bring.
 */

export const IMPORT_NOTE_CODES = [
  /** The `descanso` day and its carbohydrate cut have no equivalent record. */
  "restDayNotImported",
  /** Per-macro splits collapsed into one share. `value` is the worst, in pp. */
  "mealShareFlattened",
  /** Nothing reads a distribution of all zeroes; the meals were split evenly. */
  "distributionEmpty",
  /** A stored option index the catalogue has no option for. */
  "selectionOutOfRange",
  /** The three `MAPPING_NOTES`, per food. */
  "foodCorrected",
  "foodFoundInTaco",
  "foodOtherCultivar",
  /** The three `CUSTOM_REASONS`, per food. */
  "foodNotInTaco",
  "foodOtherPreparation",
  "foodNotPublished",
  /** A catalogue food `foodMap.ts` has no answer for. Unreachable, and kept. */
  "foodUnmapped",
  /** A mapped TACO row whose composition the caller did not supply. */
  "compositionMissing",
  /** A row of the old plan that never was a food: "Ômega 3", "Creatina". */
  "itemWithoutFood",
  /** The old app's fruit and nut lists, as groups the user now owns (#20). */
  "substitutionGroupCreated",
] as const;

export type ImportNoteCode = (typeof IMPORT_NOTE_CODES)[number];

export interface ImportNote {
  readonly code: ImportNoteCode;
  /** What it is about: a food's name, a key as the old file spells it. */
  readonly subject?: string;
  /** The number the note is about, when there is one. */
  readonly value?: number;
}

export interface ImportNames {
  /** The imported plan's name. Localised, so it arrives from the screen. */
  readonly diet: string;
  readonly fruits: string;
  readonly nuts: string;
  /** What the two decisions in a meal are called: the carbohydrate, and the protein. */
  readonly carbSet: string;
  readonly proteinSet: string;
}

export interface ImportOptions {
  readonly profile: PredecessorProfile;
  readonly catalogue: Catalogue;
  /**
   * The TACO rows, by id — see `neededTacoIds`. A missing one is reported and
   * the item still points at the row: an unresolved food is a state the plan
   * screen already shows, and inventing numbers for it would not be.
   */
  readonly compositions: ReadonlyMap<number, FoodComposition>;
  readonly names: ImportNames;
  /** What the plan is sized against — the device's, never the file's (#123). */
  readonly body: ImportBody;
  readonly now: IsoTimestamp;
  readonly newId: () => Id;
}

/**
 * The body the imported plan is built for.
 *
 * Handed in rather than read, because this module takes no I/O:
 * `loadImportBody` in `store.ts` assembles it from the profile, the weight log
 * and the goal, and refuses the import when one of the three is missing. The
 * expenditure arrives already computed so that this and `/energia` cannot drift
 * into two versions of the same equation.
 */
export interface ImportBody {
  readonly totalDailyEnergyExpenditure: number;
  /** The latest weighing, which `Diet.basedOnWeightKg` records. */
  readonly weightKg: number;
  readonly goal: MacroGoal;
}

export interface ImportResult {
  readonly diet: Diet;
  readonly customFoods: readonly CustomFood[];
  readonly groups: readonly SubstitutionGroup[];
  readonly notes: readonly ImportNote[];
}

/** The day the import reads. See the module note on the rest day. */
const IMPORTED_DAY: DayType = "treino";

/**
 * Every TACO row the catalogue can reach, for the caller to fetch before
 * importing.
 *
 * All of them rather than only the ones the stored selections point at: the
 * substitution groups offer foods the plan is *not* using, which is the entire
 * point of a group, and their compositions are nowhere else on the device.
 */
export function neededTacoIds(catalogue: Catalogue): number[] {
  const ids = new Set<number>();
  for (const foodKey of Object.keys(catalogue.foods)) {
    const mapping = mappingFor(foodKey);
    if (mapping?.kind === "taco") ids.add(mapping.tacoId);
  }
  return [...ids].sort((a, b) => a - b);
}

const CUSTOM_NOTE = {
  notInTaco: "foodNotInTaco",
  otherPreparation: "foodOtherPreparation",
  notPublished: "foodNotPublished",
} as const satisfies Record<string, ImportNoteCode>;

const MAPPING_NOTE = {
  corrected: "foodCorrected",
  foundInTaco: "foodFoundInTaco",
  otherCultivar: "foodOtherCultivar",
} as const satisfies Record<string, ImportNoteCode>;

export function importPlan({
  profile,
  catalogue,
  compositions,
  names,
  body,
  now,
  newId,
}: ImportOptions): ImportResult {
  const notes: ImportNote[] = [];
  const note = (code: ImportNoteCode, subject?: string, value?: number) => {
    notes.push({
      code,
      ...(subject === undefined ? {} : { subject }),
      ...(value === undefined ? {} : { value }),
    });
  };

  // This device's targets, not the file's (see the module note). The same call
  // the energy screen and the home screen make, on the same three inputs, so
  // the plan this import writes opens showing the numbers `/energia` already
  // showed — rather than a set of grams from a body the user no longer has.
  const { targets } = planMacros({
    totalDailyEnergyExpenditure: body.totalDailyEnergyExpenditure,
    weightKg: body.weightKg,
    goal: body.goal,
  });

  const customFoods: CustomFood[] = [];
  const refs = new Map<string, FoodRef>();

  /**
   * One `FoodRef` per catalogue key, whatever asks for it — a meal item, or a
   * substitution group. A second custom food for the same key would be a
   * duplicate in the user's own food list that they never created, and a swap
   * that silently changed which of the two a plan pointed at.
   */
  const refFor = (foodKey: string): FoodRef => {
    const existing = refs.get(foodKey);
    if (existing !== undefined) return existing;

    const food = catalogue.foods[foodKey];
    const name = food?.name ?? foodKey;
    const mapping = mappingFor(foodKey);

    let ref: FoodRef;
    if (mapping?.kind === "taco") {
      ref = { source: "taco", tacoId: mapping.tacoId };
      if (mapping.note !== undefined) note(MAPPING_NOTE[mapping.note], name);

      if (!compositions.has(mapping.tacoId)) note("compositionMissing", name);
    } else {
      note(
        mapping === undefined ? "foodUnmapped" : CUSTOM_NOTE[mapping.reason],
        name,
      );
      const custom = toCustomFood(food, foodKey, newId(), now);
      customFoods.push(custom);
      ref = { source: "custom", customFoodId: custom.id };
    }

    refs.set(foodKey, ref);
    return ref;
  };

  const groups = readGroups(
    catalogue,
    names,
    refFor,
    compositions,
    newId,
    now,
    note,
  );
  const groupFor = new Map<string, Id>();
  for (const [list, group] of groups) {
    for (const entry of catalogue[list]) groupFor.set(entry.foodKey, group.id);
  }

  const shares = readShares(profile, catalogue.meals.length, note);

  const rows = (sources: readonly CatalogueItem[]): DietItem[] => {
    const built: DietItem[] = [];
    for (const source of sources) {
      const item = toDietItem(source, refFor, groupFor, newId, note);
      if (item !== undefined) built.push(item);
    }
    return built.slice(0, ITEM_LIMITS.count.max);
  };

  /**
   * Two decisions per meal, kept as decisions (#122).
   *
   * The old app asks which carbohydrate and which protein, and stores the two
   * answers as indices. Reading only the answers was a plan with the choices
   * boiled off: the catalogue's 32 options arrived as 8 rows, and nothing said
   * the other 24 had ever been offered. They come across as `OptionSet`s
   * instead, with the stored index selecting one, so the plate opens as it was
   * saved and the question is still there to be answered differently tomorrow.
   *
   * `OPTION_LIMITS.sets.max` is 1 and stays 1. It governs what the builder lets
   * a person *create*; `options.ts` already says a meal that arrived from
   * somewhere else may hold more, and every function there walks all of them.
   */
  const meals: Meal[] = catalogue.meals.map((mealSpec, index) => {
    const selection = profile.selection[IMPORTED_DAY];
    const items = rows(mealSpec.fixed);
    const optionSets: OptionSet[] = [];

    for (const list of [
      {
        options: mealSpec.carbOptions,
        name: names.carbSet,
        stored: selection.carb[index],
        key: `sel_${IMPORTED_DAY}_carb_${index}`,
      },
      {
        options: mealSpec.proteinOptions,
        name: names.proteinSet,
        stored: selection.prot[index],
        key: `sel_${IMPORTED_DAY}_prot_${index}`,
      },
    ]) {
      const chosen = pickIndex(list.options, list.stored, list.key, note);

      // A list of one is not a decision, so it is not a set: its rows are part
      // of the meal, the way `removeOption` unwraps the survivor when a choice
      // ends. Asking a question with one answer is worse than not asking.
      if (list.options.length < OPTION_LIMITS.options.min) {
        items.push(...rows(list.options[chosen]?.items ?? []));
        continue;
      }

      const options: DietOption[] = list.options
        .slice(0, OPTION_LIMITS.options.max)
        .map((option) => ({
          id: newId(),
          name: optionName(option.label),
          items: rows(option.items),
        }));

      optionSets.push({
        id: newId(),
        name: list.name,
        selectedId: (options[chosen] ?? options[0]).id,
        options,
      });
    }

    return {
      id: newId(),
      name: mealSpec.note,
      share: shares[index] ?? 0,
      items: items.slice(0, ITEM_LIMITS.count.max),
      ...(optionSets.length === 0 ? {} : { optionSets }),
    };
  });

  note("restDayNotImported");

  // Every row the plan holds, selected or not: switching version on a phone
  // with no signal has to price the version being switched to, so its foods
  // need a snapshot as much as today's do. The groups keep their own.
  const tacoFoods = quote(
    meals.flatMap((meal) => allItems(meal).map((item) => item.food)),
    compositions,
  );

  const diet: Diet = {
    ...newPlan(
      { id: newId(), name: names.diet },
      meals,
      targets,
      body.weightKg,
      now,
    ),
    ...(tacoFoods.length === 0 ? {} : { tacoFoods }),
  };

  return {
    diet,
    customFoods,
    groups: groups.map(([, group]) => group),
    notes,
  };
}

type Note = (code: ImportNoteCode, subject?: string, value?: number) => void;

/**
 * Three splits into one.
 *
 * Each macro's percentages are normalised on their own — the old app's boxes
 * did not have to add to a hundred either — and then the meal's share of the
 * day is its share of the day's *energy*, which is the only weighting that
 * leaves the totals where they were. The deviation reported is the largest
 * distance any single macro travels, in percentage points: 0 when the three
 * splits agreed, and a number worth reading when breakfast was carbohydrate.
 */
function readShares(
  profile: PredecessorProfile,
  mealCount: number,
  note: Note,
): number[] {
  const even = () => Array.from({ length: mealCount }, () => 1 / mealCount);

  const fractions = new Map<CatalogueMacro, number[]>();
  for (const macro of CATALOGUE_MACROS) {
    const stored = profile.distribution[IMPORTED_DAY][macro].slice(
      0,
      mealCount,
    );
    const total = stored.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      note("distributionEmpty", macro);
      fractions.set(macro, even());
    } else {
      fractions.set(
        macro,
        stored.map((value) => value / total),
      );
    }
  }

  const energies = Array.from({ length: mealCount }, (_unused, index) =>
    macroEnergy({
      proteinG: profile.coeffProtein * (fractions.get("protein")![index] ?? 0),
      carbG: profile.coeffCarb * (fractions.get("carb")![index] ?? 0),
      fatG: profile.coeffFat * (fractions.get("fat")![index] ?? 0),
    }),
  );

  const total = energies.reduce((sum, value) => sum + value, 0);
  const shares = total <= 0 ? even() : energies.map((value) => value / total);

  let worst = 0;
  for (const macro of CATALOGUE_MACROS) {
    for (const [index, fraction] of fractions.get(macro)!.entries()) {
      worst = Math.max(worst, Math.abs(fraction - (shares[index] ?? 0)));
    }
  }
  // A tenth of a percentage point is rounding, not a flattening anyone can eat.
  const deviation = Math.round(worst * 1000) / 10;
  if (deviation >= 0.1) note("mealShareFlattened", undefined, deviation);

  return shares;
}

/** The stored option index, or the first option when it points at nothing. */
function pickIndex(
  options: readonly CatalogueOption[],
  index: number | undefined,
  key: string,
  note: Note,
): number {
  if (index !== undefined && index >= 0 && index < options.length) {
    return index;
  }
  note("selectionOutOfRange", key, index);
  return 0;
}

/**
 * The catalogue's own label for a version, when it fits in a name.
 *
 * "Aveia + fruta + pasta de amendoim" is what the old app printed on the button
 * and what the person choosing recognises. A label too long for
 * `OPTION_LIMITS.nameLength` arrives unnamed instead, which loses nothing:
 * `optionSignature` reads a version off its first two foods.
 */
function optionName(label: string): string {
  const checked = checkOptionName(label);
  return "error" in checked ? "" : checked.value;
}

function toDietItem(
  source: CatalogueItem,
  refFor: (foodKey: string) => FoodRef,
  groupFor: ReadonlyMap<string, Id>,
  newId: () => Id,
  note: Note,
): DietItem | undefined {
  // "Ômega 3", "Creatina", "Salada de folhas verdes à vontade": rows the old
  // app printed on the plan that were never a quantity of a food. There is
  // nothing here to weigh, so they are reported rather than invented.
  if (source.foodKey === null) {
    note("itemWithoutFood", source.label ?? undefined);
    return undefined;
  }

  const base = source.baseQtyG?.[IMPORTED_DAY];
  const item = newItem(
    refFor(source.foodKey),
    newId(),
    base !== undefined && base > 0 ? base : undefined,
  );
  const groupId = groupFor.get(source.foodKey);

  return {
    ...item,
    // Not scalable in the old app means the quantity *is* the plan — a fruit,
    // a spoon of olive oil — so it arrives pinned: `minG === maxG` is a column
    // the solver cannot move, and it is credited rather than resized (#19).
    ...(source.scalable
      ? {}
      : { mandatory: true, minG: item.quantityG, maxG: item.quantityG }),
    ...(groupId === undefined ? {} : { substitutionGroupId: groupId }),
  };
}

/**
 * The old app's fruit and nut lists, as records the user owns (#20).
 *
 * This is the one place the import *adds* something rather than translating it.
 * The predecessor had a fruit swap hardcoded into one meal — the exact thing
 * #20 exists to generalise — and dropping it on import would lose the only part
 * of the old plan that was already a substitution. As a `SubstitutionGroup` it
 * is the user's own record from the first second: editable, deletable, and
 * usable in any meal rather than the one it came from.
 */
function readGroups(
  catalogue: Catalogue,
  names: ImportNames,
  refFor: (foodKey: string) => FoodRef,
  compositions: ReadonlyMap<number, FoodComposition>,
  newId: () => Id,
  now: IsoTimestamp,
  note: Note,
): [list: "fruits" | "nuts", group: SubstitutionGroup][] {
  const built: [list: "fruits" | "nuts", group: SubstitutionGroup][] = [];

  for (const list of ["fruits", "nuts"] as const) {
    const entries = catalogue[list];
    if (entries.length < GROUP_LIMITS.foods.min) continue;

    const foods = entries
      .slice(0, GROUP_LIMITS.foods.max)
      .map((entry) => refFor(entry.foodKey));

    const tacoFoods = quote(foods, compositions);

    built.push([
      list,
      {
        id: newId(),
        name: names[list],
        foods,
        ...(tacoFoods.length === 0 ? {} : { tacoFoods }),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    note("substitutionGroupCreated", names[list], foods.length);
  }

  return built;
}

/**
 * A catalogue food as a food of the user's own.
 *
 * The numbers are the old app's, which is the honest source: they are what the
 * plan being imported was built from, and a food is here precisely because
 * TACO has no row to quote instead. `kcal` is derived rather than copied, on
 * `deriveKcal`'s terms — the energy of a food has to agree with its own macros
 * or every total downstream is a few kilocalories away from its rows.
 */
function toCustomFood(
  food: CatalogueFood | undefined,
  foodKey: string,
  id: Id,
  now: IsoTimestamp,
): CustomFood {
  const per100g = food?.per100g ?? { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

  return {
    id,
    name: food?.name ?? foodKey,
    per100g: {
      proteinG: per100g.proteinG,
      carbG: per100g.carbG,
      fatG: per100g.fatG,
      kcal: deriveKcal(per100g.proteinG, per100g.carbG, per100g.fatG),
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The compositions for the TACO rows in a set of references, once each.
 *
 * A missing one is left out rather than faked: `refFor` has already reported it
 * by name, and an item pointing at a row with no numbers is a state the plan
 * screen shows as unresolved — which is the truth about it.
 */
function quote(
  refs: readonly FoodRef[],
  compositions: ReadonlyMap<number, FoodComposition>,
): FoodComposition[] {
  const ids = new Set(
    refs.flatMap((ref) => (ref.source === "taco" ? [ref.tacoId] : [])),
  );

  return [...ids].flatMap((id) => {
    const composition = compositions.get(id);
    return composition === undefined ? [] : [composition];
  });
}
