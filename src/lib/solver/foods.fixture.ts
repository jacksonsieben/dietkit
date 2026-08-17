import type { MacroSet } from "@/lib/storage/types";

/**
 * Approximate TACO values, per 100 g, for solver tests and benchmarks only.
 *
 * Deliberately *not* the real dataset: the ingest pipeline (#3) owns that, and
 * these are rounded stand-ins so a solver test never doubles as an unattributed
 * copy of TACO. Real numbers arrive with their attribution attached (#4).
 */
export const FIXTURE_FOODS: Record<string, MacroSet> = {
  arroz: { kcal: 128, proteinG: 2.5, carbG: 28.1, fatG: 0.2 },
  feijao: { kcal: 76, proteinG: 4.8, carbG: 13.6, fatG: 0.5 },
  frango: { kcal: 159, proteinG: 32.0, carbG: 0, fatG: 2.5 },
  ovo: { kcal: 146, proteinG: 13.3, carbG: 0.6, fatG: 9.5 },
  azeite: { kcal: 884, proteinG: 0, carbG: 0, fatG: 100 },
  pao: { kcal: 300, proteinG: 8.0, carbG: 58.6, fatG: 3.1 },
  leite: { kcal: 61, proteinG: 2.9, carbG: 4.7, fatG: 3.2 },
  aveia: { kcal: 394, proteinG: 13.9, carbG: 66.6, fatG: 8.5 },
  banana: { kcal: 98, proteinG: 1.3, carbG: 26.0, fatG: 0.1 },
  whey: { kcal: 400, proteinG: 80.0, carbG: 8.0, fatG: 6.0 },
  batataDoce: { kcal: 77, proteinG: 0.6, carbG: 18.4, fatG: 0.1 },
  brocolis: { kcal: 25, proteinG: 2.1, carbG: 4.4, fatG: 0.5 },
  queijoMinas: { kcal: 264, proteinG: 17.4, carbG: 3.6, fatG: 20.2 },
  atum: { kcal: 116, proteinG: 25.7, carbG: 0, fatG: 1.0 },
  castanha: { kcal: 643, proteinG: 14.5, carbG: 15.1, fatG: 63.5 },
};

export const FIXTURE_FOOD_IDS = Object.keys(FIXTURE_FOODS);
