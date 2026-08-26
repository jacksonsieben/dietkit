import type {
  FoodComposition,
  FoodRef,
  Id,
  IsoTimestamp,
  Meal,
  SubstitutionGroup,
} from "@/lib/storage/types";

import { foodKey, type FoodBook } from "./composition";
import { sameFood } from "./items";
import { siblingItems } from "./options";

/**
 * Foods that may stand in for one another (#20).
 *
 * The predecessor shipped one substitution list — fruits, in the morning meal —
 * and that is the shape of the mistake this generalises. "Interchangeable" is
 * not a property of a food; it is a judgement the person eating makes, and it
 * is as true of rice and potato as of banana and papaya. So a group is a record
 * the user writes: nothing here ships a group, and nothing reads a TACO
 * category to guess one.
 *
 * The other half of the issue lives in `solve.ts` and needs no code at all.
 * Quantities are solved at render time from whatever food each item points at,
 * so swapping a member is an edit to `item.food` and the grams follow. The
 * bounds stay on the *slot*: `minG`, `maxG` and `mandatory` describe how much
 * room this position in the meal has, which is a fact about the meal rather
 * than about the food currently filling it.
 *
 * Pure, and separate from the screen for `custom.ts`'s reason: the same rules
 * have to run again on import (#26), where there is no form.
 */

export const GROUP_LIMITS = {
  nameLength: { min: 2, max: 60 },
  /**
   * Two, because a group of one is a food and offers no substitution; twenty,
   * because past that the swap control stops being a list a person reads.
   */
  foods: { min: 2, max: 20 },
  /** More groups than this and the picker is worse than the food search. */
  count: { max: 30 },
} as const;

export const GROUP_ERROR_CODES = [
  "required",
  "nameLength",
  "nameTaken",
  "tooFewFoods",
  "tooManyFoods",
] as const;

export type GroupErrorCode = (typeof GROUP_ERROR_CODES)[number];

export const GROUP_FIELDS = ["name", "foods"] as const;

export type GroupField = (typeof GROUP_FIELDS)[number];

export type GroupErrors = Partial<Record<GroupField, GroupErrorCode>>;

export interface GroupInput {
  name: string;
  foods: FoodRef[];
  tacoFoods?: FoodComposition[];
}

export type GroupValidation =
  { ok: true; value: GroupInput } | { ok: false; errors: GroupErrors };

type Checked<T> = { value: T } | { error: GroupErrorCode };

/**
 * A name, and the rule that two groups may not share one.
 *
 * Names are how a group is picked on the item row — the id never reaches the
 * screen — so two groups called "Frutas" would be two identical options with
 * different contents. `editing` keeps a group from colliding with itself when
 * only its foods changed.
 */
export function checkGroupName(
  raw: string,
  existing: readonly SubstitutionGroup[] = [],
  editing?: Id,
): Checked<string> {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "required" };
  if (
    trimmed.length < GROUP_LIMITS.nameLength.min ||
    trimmed.length > GROUP_LIMITS.nameLength.max
  ) {
    return { error: "nameLength" };
  }

  const taken = existing.some(
    (group) =>
      group.id !== editing &&
      group.name.localeCompare(trimmed, "pt-BR", { sensitivity: "base" }) === 0,
  );
  if (taken) return { error: "nameTaken" };

  return { value: trimmed };
}

function checkGroupFoods(foods: readonly FoodRef[]): Checked<FoodRef[]> {
  const unique: FoodRef[] = [];
  for (const food of foods) {
    if (!unique.some((kept) => sameFood(kept, food))) unique.push(food);
  }

  if (unique.length < GROUP_LIMITS.foods.min) return { error: "tooFewFoods" };
  if (unique.length > GROUP_LIMITS.foods.max) return { error: "tooManyFoods" };

  return { value: unique };
}

/** One pass over the whole draft, like every other form here. */
export function validateGroup(
  draft: GroupInput,
  existing: readonly SubstitutionGroup[] = [],
  editing?: Id,
): GroupValidation {
  const name = checkGroupName(draft.name, existing, editing);
  const foods = checkGroupFoods(draft.foods);

  const errors: GroupErrors = {};
  if ("error" in name) errors.name = name.error;
  if ("error" in foods) errors.foods = foods.error;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (!("value" in name) || !("value" in foods)) return { ok: false, errors };

  return {
    ok: true,
    value: {
      name: name.value,
      foods: foods.value,
      tacoFoods: keptCompositions(foods.value, draft.tacoFoods ?? []),
    },
  };
}

/**
 * The composition snapshots the group still needs.
 *
 * Same rule as `usedTacoFoods`, applied to a different collection: dropping a
 * member drops its copy, so a group edited for a year does not carry every food
 * ever considered for it.
 */
export function keptCompositions(
  foods: readonly FoodRef[],
  known: readonly FoodComposition[],
): FoodComposition[] {
  const byId = new Map(known.map((food) => [food.tacoId, food]));
  const kept: FoodComposition[] = [];

  for (const ref of foods) {
    if (ref.source !== "taco") continue;
    const food = byId.get(ref.tacoId);
    if (food !== undefined) kept.push(food);
  }

  return kept;
}

export function canAddGroupFood(foods: readonly FoodRef[]): boolean {
  return foods.length < GROUP_LIMITS.foods.max;
}

export function addGroupFood(
  foods: readonly FoodRef[],
  food: FoodRef,
): FoodRef[] {
  if (!canAddGroupFood(foods)) return [...foods];
  if (foods.some((kept) => sameFood(kept, food))) return [...foods];
  return [...foods, food];
}

export function removeGroupFood(
  foods: readonly FoodRef[],
  food: FoodRef,
): FoodRef[] {
  return foods.filter((kept) => !sameFood(kept, food));
}

export function toGroup(
  input: GroupInput,
  identity: { id: Id; createdAt: IsoTimestamp },
  now: IsoTimestamp,
): SubstitutionGroup {
  const tacoFoods = keptCompositions(input.foods, input.tacoFoods ?? []);

  return {
    id: identity.id,
    name: input.name,
    foods: [...input.foods],
    ...(tacoFoods.length > 0 ? { tacoFoods } : {}),
    createdAt: identity.createdAt,
    updatedAt: now,
  };
}

export function canAddGroup(groups: readonly SubstitutionGroup[]): boolean {
  return groups.length < GROUP_LIMITS.count.max;
}

/**
 * Every group's snapshots, for the plan's food book.
 *
 * A group's alternatives are by definition foods the plan is *not* using, so
 * their numbers are in no other store on the device. Without this, the first
 * swap of the day would be the one action in this app that needs a network.
 */
export function groupCompositions(
  groups: readonly SubstitutionGroup[],
): FoodComposition[] {
  const byId = new Map<number, FoodComposition>();
  for (const group of groups) {
    for (const food of group.tacoFoods ?? []) {
      if (!byId.has(food.tacoId)) byId.set(food.tacoId, food);
    }
  }
  return [...byId.values()];
}

export function findGroup(
  groups: readonly SubstitutionGroup[],
  id: Id | undefined,
): SubstitutionGroup | undefined {
  return id === undefined ? undefined : groups.find((group) => group.id === id);
}

/**
 * The groups a given food may be swapped within.
 *
 * Only groups that already contain the food, which is what keeps a slot honest:
 * attaching a group to a row never changes what is on the plate, it only says
 * what else would be acceptable there. Attaching a group the food is not in
 * would mean either silently replacing the food or offering a swap list that
 * does not include what is currently being eaten.
 */
export function groupsForFood(
  groups: readonly SubstitutionGroup[],
  food: FoodRef,
): SubstitutionGroup[] {
  return groups.filter((group) =>
    group.foods.some((member) => sameFood(member, food)),
  );
}

export interface Alternative {
  readonly ref: FoodRef;
  readonly key: string;
  /** From the food book; `undefined` when no snapshot for it survived. */
  readonly name?: string;
  /** The food the slot holds right now. */
  readonly current: boolean;
  /**
   * Already on the plate in this meal, in some other row. Offered but not
   * choosable: a meal keeps one row per food, so swapping onto it would either
   * merge two slots or leave a duplicate the solver would size twice.
   */
  readonly taken: boolean;
}

export function alternativesFor(
  group: SubstitutionGroup,
  meal: Meal,
  itemId: Id,
  book: FoodBook,
): Alternative[] {
  // Scoped to the row's own container (#111): the same food may legitimately
  // sit in a different option of the same set, and calling that "taken" would
  // refuse a swap that clashes with nothing on the plate.
  const siblings = siblingItems(meal, itemId);
  const item = siblings.find((candidate) => candidate.id === itemId);

  return group.foods.map((ref) => ({
    ref,
    key: foodKey(ref),
    name: book.get(foodKey(ref))?.name,
    current: item !== undefined && sameFood(item.food, ref),
    taken: siblings.some(
      (other) => other.id !== itemId && sameFood(other.food, ref),
    ),
  }));
}
