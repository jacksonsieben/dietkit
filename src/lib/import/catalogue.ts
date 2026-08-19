import type { MacroSet } from "@/lib/storage/types";

/**
 * A frozen copy of the predecessor's food and meal tables (#22).
 *
 * The exported profile JSON does not contain a diet. It contains scalars and
 * *indices* — `sel_treino_carb_2: 1` means "the second carbohydrate option of
 * meal 3", and which foods that is lives in the predecessor's `diet_data.py`,
 * not in the file. So an importer that reads only the export cannot know what
 * anyone was eating. This module is the missing half.
 *
 * Frozen deliberately. It is a snapshot of one commit of
 * github.com/jacksonsieben/diet_calculator_app, not a mirror: if that app
 * changes its option lists tomorrow, indices in files exported *before* the
 * change still have to mean what they meant when they were written. Editing
 * these tables to match a newer version of the predecessor would silently
 * re-point every profile ever exported. A newer format should arrive as a
 * second catalogue with its own version, not as an edit to this one.
 *
 * The per-100 g figures are the predecessor's own, kept as the fallback for
 * foods that have no TACO row (see `foodMap.ts`). They are not TACO data and
 * are not presented as such.
 */

/** The two day types the predecessor plans separately. */
export const DAY_TYPES = ["treino", "descanso"] as const;

export type DayType = (typeof DAY_TYPES)[number];

/** The macros the predecessor splits across meals, in its own spelling. */
export const CATALOGUE_MACROS = ["carb", "protein", "fat"] as const;

export type CatalogueMacro = (typeof CATALOGUE_MACROS)[number];

export interface CatalogueFood {
  readonly name: string;
  readonly per100g: MacroSet;
}

export interface CatalogueItem {
  /**
   * A key into `foods`, or `null` for a row that has no composition at all —
   * a supplement, or "salad, as much as you like". Those are the rows that
   * cannot become a diet item however good the food mapping is, and the
   * importer reports them by name rather than dropping them.
   */
  readonly foodKey: string | null;
  /** Present only on the food-less rows, which is where the name has to come from. */
  readonly label?: string | null;
  /** Whether the predecessor resized this row to hit the meal's target. */
  readonly scalable: boolean;
  /** The portion as the original diet wrote it, per day type. */
  readonly baseQtyG: { readonly treino: number; readonly descanso: number } | null;
  readonly unit?: string | null;
  readonly note?: string | null;
}

export interface CatalogueOption {
  readonly id: string;
  readonly label: string;
  readonly items: readonly CatalogueItem[];
}

export interface CatalogueMeal {
  readonly id: number;
  readonly name: string;
  readonly note: string;
  readonly carbOptions: readonly CatalogueOption[];
  readonly proteinOptions: readonly CatalogueOption[];
  /** Rows present whatever the user picked: vegetables, oil, supplements. */
  readonly fixed: readonly CatalogueItem[];
}

export interface Catalogue {
  readonly foods: Readonly<Record<string, CatalogueFood>>;
  readonly meals: readonly CatalogueMeal[];
  readonly fruits: readonly { foodKey: string; label: string; qtyG: number }[];
  readonly nuts: readonly { foodKey: string; label: string; qtyG: number }[];
}
