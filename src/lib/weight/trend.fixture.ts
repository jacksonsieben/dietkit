import type { WeightEntry } from "@/lib/storage/types";

/**
 * A weighing, with only the two fields the trend reads spelled out.
 *
 * `id` and `recordedAt` are filled in with something plausible because the type
 * requires them, not because anything here looks at them — the trend is a
 * function of the day and the number, and a test that had to invent timestamps
 * would be saying otherwise.
 */
export function weighing(date: string, weightKg: number): WeightEntry {
  return {
    id: `weight-${date}`,
    date,
    weightKg,
    recordedAt: `${date}T09:00:00.000Z`,
  };
}

/** A fortnight of daily weighings that trend down through visible noise. */
export const FORTNIGHT: WeightEntry[] = [
  weighing("2026-08-01", 84.2),
  weighing("2026-08-02", 84.8),
  weighing("2026-08-03", 83.9),
  weighing("2026-08-04", 84.1),
  weighing("2026-08-05", 83.6),
  weighing("2026-08-06", 84.0),
  weighing("2026-08-07", 83.4),
  weighing("2026-08-08", 83.7),
  weighing("2026-08-09", 83.1),
  weighing("2026-08-10", 83.5),
  weighing("2026-08-11", 82.9),
  weighing("2026-08-12", 83.2),
  weighing("2026-08-13", 82.6),
  weighing("2026-08-14", 82.8),
];
