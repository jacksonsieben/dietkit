import { fold } from "@/lib/text";

import type { FoodListing } from "./results";

/**
 * Whether a TACO row is the food as bought or the food as eaten (#F).
 *
 * The table lists both, under names that differ by one word at the end:
 * "Arroz, tipo 1, cru" and "Arroz, tipo 1, cozido" are 358 kcal and 128 kcal
 * per 100 g of the same rice. Of the 597 published rows, 229 are raw and 136
 * are cooked, so a search for "arroz" hands back the two interleaved, and
 * picking the wrong one silently prices the whole day at roughly triple.
 *
 * Read off the name because that is where TACO puts it — there is no column for
 * preparation, and inventing one during the ingest would mean this app deciding
 * something the publication did not say. Read here rather than at the ingest
 * for the same reason: nothing is stored, so a row this misreads is a row in a
 * slightly odd position, never a row with a wrong number attached to it.
 */

export type Preparation = "raw" | "cooked";

/**
 * The words, folded, exactly as the fourth edition writes them.
 *
 * Both genders of each, because Portuguese agrees the participle with the food
 * and TACO writes "arroz cozido" beside "lasanha cozida". No description in the
 * published table carries a word from both sets, which is what makes a set
 * lookup enough and a precedence rule unnecessary.
 */
const RAW = new Set(["cru", "crua", "crus", "cruas"]);
const COOKED = new Set([
  "cozido",
  "cozida",
  "assado",
  "assada",
  "grelhado",
  "grelhada",
  "frito",
  "frita",
  "refogado",
  "refogada",
]);

/**
 * `undefined` for the 232 rows that say neither — bread, milk, a cheese.
 *
 * Not a failure to classify: those foods are eaten as they are published, so
 * there is no second row of the same food to confuse them with.
 */
export function preparationOf(description: string): Preparation | undefined {
  for (const word of fold(description).split(/[^a-z0-9]+/)) {
    if (COOKED.has(word)) return "cooked";
    if (RAW.has(word)) return "raw";
  }

  return undefined;
}

/** Cooked, then the foods that are simply foods, then raw. */
const RANK: Record<Preparation | "unmarked", number> = {
  cooked: 0,
  unmarked: 1,
  raw: 2,
};

/**
 * The same list, with what you eat above what you buy.
 *
 * Raw last rather than hidden: raw oats and raw rice are real answers for
 * someone who weighs the packet, and this app does not get to decide that
 * their way of eating is the wrong one. It only declines to open with it.
 *
 * A stable sort over the merged list, which preserves both orders inside each
 * band: the user's own foods stay above TACO's — `mergeListings` explains why —
 * and inside TACO the endpoint's prefix-then-alphabetical order survives, so
 * two identical searches still produce two identical lists.
 */
export function cookedFirst(listings: readonly FoodListing[]): FoodListing[] {
  const rank = (listing: FoodListing) =>
    listing.source === "custom"
      ? -1
      : RANK[preparationOf(listing.food.description) ?? "unmarked"];

  return [...listings].sort((a, b) => rank(a) - rank(b));
}
