import { ITEM_LIMITS, newItem } from "@/lib/diet/items";
import { newPlan } from "@/lib/diet/plan";
import { GROUP_LIMITS } from "@/lib/diet/groups";
import { basalMetabolicRate } from "@/lib/energy/bmr";
import { MACRO_GOAL_LIMITS, macroEnergy } from "@/lib/energy/macros";
import {
  ACTIVITY_FACTOR_RANGE,
  totalDailyEnergyExpenditure,
} from "@/lib/energy/tdee";
import { deriveKcal } from "@/lib/foods/custom";
import { ACTIVITY_LEVELS } from "@/lib/profile/activity";
import { PROFILE_LIMITS } from "@/lib/profile/validation";
import type {
  CustomFood,
  Diet,
  DietItem,
  FoodComposition,
  FoodRef,
  Id,
  IsoDate,
  IsoTimestamp,
  MacroGoal,
  MacroSet,
  Meal,
  Profile,
  Sex,
  SubstitutionGroup,
  WeightEntry,
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
 * The four that are worth stating up front, because they are decisions rather
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
 * - **The targets come from the coefficients, not from the equation.** The
 *   predecessor derived grams from g/kg coefficients and separately showed a
 *   TDEE-based target, and it knew the two disagreed — its `MacroTotals` has a
 *   `delta_kcal` for exactly that. `Diet.targets` is what the plan was actually
 *   built against, so the coefficients win here and the difference from this
 *   app's own equation (#14, #15) is reported.
 * - **A food TACO does not publish becomes a custom food** with the old app's
 *   own numbers, which is what `CUSTOM_REASONS` in `foodMap.ts` enumerates.
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
  /** `coeff_carb` has no analogue: this app fills carbohydrate as remainder. */
  "carbCoefficientKept",
  /** g/kg of bodyweight became a fixed number of kilocalories. */
  "fatUnitChanged",
  /** The plan's own energy against what #14 and #15 would have computed. */
  "planEnergyDiffers",
  /** An age became a birth date, which will now age on its own. */
  "birthDateEstimated",
  "sexUnrecognised",
  "activityFactorCustom",
  "activityIndexOutOfRange",
  /** A stored option index the catalogue has no option for. */
  "selectionOutOfRange",
  /** A number outside this app's own bounds, brought to the nearest one. */
  "valueClamped",
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
  /** The day the weight is logged on, and the base for the birth date. */
  readonly today: IsoDate;
  readonly now: IsoTimestamp;
  readonly newId: () => Id;
}

export interface ImportResult {
  readonly profile: Profile;
  readonly weight: WeightEntry;
  readonly goal: MacroGoal;
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
  today,
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

  /**
   * The old file's own bounds are the old app's; these are ours, and the two
   * do not have to agree. Bringing a value to the nearest bound rather than
   * refusing the file is the same stance `parseLimit` takes: an import that
   * fails on one implausible number is an import nobody completes — but a
   * number that moved is a number the user is told about.
   */
  const clamp = (
    key: string,
    value: number,
    range: { min: number; max: number },
  ) => {
    const held = Math.min(range.max, Math.max(range.min, value));
    if (held !== value) note("valueClamped", key, held);
    return held;
  };

  const weightKg = clamp(
    "weight_kg",
    profile.weightKg,
    PROFILE_LIMITS.weightKg,
  );
  const heightCm = clamp(
    "height_cm",
    profile.heightCm,
    PROFILE_LIMITS.heightCm,
  );
  const ageYears = Math.round(
    clamp("age", profile.age, PROFILE_LIMITS.ageYears),
  );

  const sex = readSex(profile.sexLabel);
  if (sex === undefined) note("sexUnrecognised", profile.sexLabel);

  const activityFactor = readActivityFactor(profile, clamp, note);

  note("birthDateEstimated", undefined, ageYears);
  const stored: Profile = {
    heightCm,
    birthDate: birthDateFor(today, ageYears),
    sex: sex ?? "male",
    activityFactor,
    updatedAt: now,
  };

  const weight: WeightEntry = {
    id: newId(),
    date: today,
    weightKg,
    recordedAt: now,
  };

  // The plan's own numbers, straight from the coefficients the old app scaled
  // its portions with. `kcal` is what the *rounded* grams are worth, on
  // `MacroPlan.targets`' terms: a MacroSet whose energy disagrees with its own
  // grams puts a reconciliation error into everything downstream of it.
  const exact = {
    proteinG: profile.coeffProtein * weightKg,
    carbG: profile.coeffCarb * weightKg,
    fatG: profile.coeffFat * weightKg,
  };
  const targets: MacroSet = {
    proteinG: Math.round(exact.proteinG),
    carbG: Math.round(exact.carbG),
    fatG: Math.round(exact.fatG),
    kcal: 0,
  };
  targets.kcal = Math.round(macroEnergy(targets));

  note("carbCoefficientKept", undefined, profile.coeffCarb);
  reportEnergyGap(
    { weightKg, heightCm, ageYears, sex: sex ?? "male" },
    activityFactor,
    profile,
    targets,
    note,
  );

  const goal = readGoal(profile, weightKg, clamp, note);

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

  const meals: Meal[] = catalogue.meals.map((mealSpec, index) => {
    const chosen = [
      pick(
        mealSpec.carbOptions,
        profile.selection[IMPORTED_DAY].carb[index],
        `sel_${IMPORTED_DAY}_carb_${index}`,
        note,
      ),
      pick(
        mealSpec.proteinOptions,
        profile.selection[IMPORTED_DAY].prot[index],
        `sel_${IMPORTED_DAY}_prot_${index}`,
        note,
      ),
    ];

    const items: DietItem[] = [];
    for (const source of [
      ...chosen.flatMap((option) => option?.items ?? []),
      ...mealSpec.fixed,
    ]) {
      const item = toDietItem(source, refFor, groupFor, newId, note);
      if (item !== undefined) items.push(item);
    }

    return {
      id: newId(),
      name: mealSpec.note,
      share: shares[index] ?? 0,
      items: items.slice(0, ITEM_LIMITS.count.max),
    };
  });

  note("restDayNotImported");

  // The rows the plan actually points at, and only those: a composition is a
  // quotation carried for the meal that uses it, and the groups keep their own.
  const tacoFoods = quote(
    meals.flatMap((meal) => meal.items.map((item) => item.food)),
    compositions,
  );

  const diet: Diet = {
    ...newPlan(
      { id: newId(), name: names.diet },
      meals,
      targets,
      weightKg,
      now,
    ),
    ...(tacoFoods.length === 0 ? {} : { tacoFoods }),
  };

  return {
    profile: stored,
    weight,
    goal,
    diet,
    customFoods,
    groups: groups.map(([, group]) => group),
    notes,
  };
}

type Note = (code: ImportNoteCode, subject?: string, value?: number) => void;
type Clamp = (
  key: string,
  value: number,
  range: { min: number; max: number },
) => number;

/** "Masculino" / "Feminino", as the old app wrote them and nothing else. */
function readSex(label: string): Sex | undefined {
  const folded = label.trim().toLowerCase();
  if (folded === "masculino") return "male";
  if (folded === "feminino") return "female";
  return undefined;
}

/**
 * An age, as the date it implies.
 *
 * Lossy in one direction that matters: the old app stored a number that stayed
 * 34 forever, and this one stores a day that will make the user 35 by itself.
 * That is the better record — an age typed once is wrong within a year — but
 * it is a change to what the file said, so `birthDateEstimated` is emitted for
 * every import rather than only for the surprising ones. The day-and-month are
 * today's, which is the only part invented here.
 */
function birthDateFor(today: IsoDate, ageYears: number): IsoDate {
  const [year, rest] = [today.slice(0, 4), today.slice(4)];
  return `${Number(year) - ageYears}${rest}`;
}

function readActivityFactor(
  profile: PredecessorProfile,
  clamp: Clamp,
  note: Note,
): number {
  if (profile.useCustomFa) {
    const factor = clamp("custom_fa", profile.customFa, ACTIVITY_FACTOR_RANGE);
    note("activityFactorCustom", undefined, factor);
    return factor;
  }

  // The two ladders are the same five rungs in the same order — 1.2 to 1.9,
  // Harris-Benedict's — so the index carries over. An index outside it is a
  // file from a version that had more of them, and the nearest rung is a
  // better answer than the middle one.
  const index = Math.round(profile.activityIdx);
  const held = Math.min(ACTIVITY_LEVELS.length - 1, Math.max(0, index));
  if (held !== index) {
    note("activityIndexOutOfRange", "activity_idx", profile.activityIdx);
  }
  return ACTIVITY_LEVELS[held]!.factor;
}

/**
 * What the old plan's energy comes to, against what this app's own chain would
 * have produced from the same person.
 *
 * The predecessor computed both too, and showed the gap as `delta_kcal`: its
 * coefficients and its Mifflin-St Jeor target were never reconciled. Importing
 * keeps the coefficients, because they are what the portions on the plate were
 * sized by — and reports the gap, because the energy screen (#15) will show the
 * other number the moment the user opens it.
 */
function reportEnergyGap(
  person: { weightKg: number; heightCm: number; ageYears: number; sex: Sex },
  activityFactor: number,
  profile: PredecessorProfile,
  targets: MacroSet,
  note: Note,
): void {
  const expenditure = totalDailyEnergyExpenditure(
    basalMetabolicRate(person),
    activityFactor,
  );
  const gap = Math.round(targets.kcal - (expenditure + profile.kcalAdjustment));
  if (gap !== 0) note("planEnergyDiffers", undefined, gap);
}

/**
 * The coefficients as a `MacroGoal`.
 *
 * Two of the three carry over: the adjustment is the same kilocalories with its
 * sign moved into `kind`, and protein is the same g/kg. Fat does not — this app
 * expresses it as a share of the target or as an absolute figure, never per
 * kilogram (see `MacroGoal.fat` for why) — so `coeff_fat` is multiplied out
 * against today's weight and stops following it. That is the one thing an
 * import can do here, and it is reported.
 */
function readGoal(
  profile: PredecessorProfile,
  weightKg: number,
  clamp: Clamp,
  note: Note,
): MacroGoal {
  const adjustment = profile.kcalAdjustment;
  const kind = adjustment < 0 ? "lose" : adjustment > 0 ? "gain" : "maintain";

  const fatKcal = clamp(
    "coeff_fat",
    Math.round(profile.coeffFat * weightKg * 9),
    MACRO_GOAL_LIMITS.fatKcal,
  );
  note("fatUnitChanged", undefined, fatKcal);

  return {
    kind,
    adjustment: {
      unit: "kcal",
      value:
        kind === "maintain"
          ? 0
          : clamp(
              "kcal_adjustment",
              Math.abs(adjustment),
              MACRO_GOAL_LIMITS.kcal,
            ),
    },
    proteinGPerKg: clamp(
      "coeff_protein",
      profile.coeffProtein,
      MACRO_GOAL_LIMITS.proteinGPerKg,
    ),
    fat: { unit: "kcal", value: fatKcal },
  };
}

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
function pick(
  options: readonly CatalogueOption[],
  index: number | undefined,
  key: string,
  note: Note,
): CatalogueOption | undefined {
  if (index !== undefined && index >= 0 && index < options.length) {
    return options[index];
  }
  note("selectionOutOfRange", key, index);
  return options[0];
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
