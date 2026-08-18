import type { FoodSearchResult } from "@/lib/db/foods";
import { fold } from "@/lib/text";
import { customFoodHaystack, type Repository } from "@/lib/storage";
import type { CustomFood, FoodRef } from "@/lib/storage/types";

/**
 * One list, two sources (#17).
 *
 * TACO is a survey of Brazilian foods as they are eaten; the foods a person
 * actually buys — a brand of whey, a supermarket bread — are not in it and
 * never will be. So the search box answers from both the published table and
 * the device, and this is where the two become one list without either
 * pretending to be the other.
 *
 * Pure, and holding no React: the merge is the part with decisions in it (what
 * comes first, what a match is, what happens when half the answer is missing),
 * and it is worth testing without a component around it.
 */

export type FoodListing =
  | {
      /** Unique across both sources — the id spaces overlap at, say, 1. */
      readonly key: string;
      readonly source: "taco";
      readonly ref: FoodRef;
      readonly food: FoodSearchResult;
    }
  | {
      readonly key: string;
      readonly source: "custom";
      readonly ref: FoodRef;
      readonly food: CustomFood;
    };

/**
 * Whether a stored food answers the words that were typed.
 *
 * Every term has to match, which is the same rule the server applies (`&` over
 * the tsquery), so a search that narrows on the published table narrows here
 * too instead of quietly widening. What a term is matched *against* is
 * `customFoodHaystack`, the same function the repository scans with — one
 * search rule, so the words after the first cannot be stricter than the first.
 */
export function matchesTerms(food: CustomFood, terms: readonly string[]): boolean {
  const haystack = customFoodHaystack(food);
  return terms.every((term) => haystack.includes(fold(term)));
}

/**
 * The device's half of the answer.
 *
 * The first term goes to the repository, which is where the scan belongs, and
 * the rest narrow what comes back. A user's own list is tens of foods, not
 * thousands, so the narrowing costs nothing and the alternative — asking the
 * repository for a query language — would be a second search engine to keep in
 * step with Postgres's.
 */
export async function searchCustomFoods(
  repository: Repository,
  terms: readonly string[],
): Promise<CustomFood[]> {
  const [first, ...rest] = terms;
  if (first === undefined) return [];

  const found = await repository.customFoods.search(first);

  // Already in name order — the repository contract requires it of every
  // adapter — and filtering keeps an order rather than making one.
  return rest.length === 0 ? found : found.filter((food) => matchesTerms(food, rest));
}

/**
 * The user's foods first, then TACO.
 *
 * Not a ranking judgement — a "how many can there be" one. A person has tens of
 * custom foods and TACO has hundreds of rows; interleaved by relevance, the one
 * food someone typed the label of by hand would sit below twenty rows of the
 * published table, which is exactly the failure #17 exists to fix. They are
 * marked as theirs on screen, so first is legible rather than confusing.
 */
export function mergeListings(
  custom: readonly CustomFood[],
  taco: readonly FoodSearchResult[],
): FoodListing[] {
  return [
    ...custom.map(
      (food): FoodListing => ({
        key: `custom:${food.id}`,
        source: "custom",
        ref: { source: "custom", customFoodId: food.id },
        food,
      }),
    ),
    ...taco.map(
      (food): FoodListing => ({
        key: `taco:${food.id}`,
        source: "taco",
        ref: { source: "taco", tacoId: food.id },
        food,
      }),
    ),
  ];
}
