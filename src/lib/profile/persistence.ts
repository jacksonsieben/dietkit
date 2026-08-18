import type { Repository } from "@/lib/storage";
import type { IsoDate, IsoTimestamp } from "@/lib/storage/types";

import type { ProfileFormInput, ProfileFormValues } from "./validation";

/**
 * Moving the profile between the form and the device's store.
 *
 * Out of the component because this is where the one structural decision lives
 * — that weight is not part of `Profile` and goes to the weight log instead —
 * and a rule of that weight should not only be observable by clicking Save in a
 * browser. Both functions take a `Repository`, so the tests run them against a
 * real adapter rather than a mock that agrees with whatever they do.
 */

export interface LoadedProfileForm {
  values: ProfileFormValues;
  /**
   * The day the seeded weight was measured. Shown next to the field, because a
   * weight from last week presented with no date reads as today's.
   */
  weightFrom?: IsoDate;
}

/**
 * Renders a stored number the way pt-BR writes one: 82.4 as "82,4".
 *
 * Deliberately not `Intl.NumberFormat`, which inserts a group separator that
 * `parseDecimal` then refuses — the field would reject the value it had just
 * been handed.
 */
export function toField(value: number): string {
  return String(value).replace(".", ",");
}

/** Empty strings, not absent keys: every field is a controlled input. */
export async function loadProfileForm(
  repository: Repository,
): Promise<LoadedProfileForm> {
  const [profile, latest] = await Promise.all([
    repository.profile.get(),
    repository.weight.latest(),
  ]);

  return {
    values: {
      weightKg: latest ? toField(latest.weightKg) : "",
      heightCm: profile ? toField(profile.heightCm) : "",
      birthDate: profile?.birthDate ?? "",
      sex: profile?.sex ?? "",
      activityFactor: profile ? toField(profile.activityFactor) : "",
    },
    weightFrom: latest?.date,
  };
}

/**
 * Writes the profile, and the weight as today's log entry.
 *
 * Two records, and no transaction spanning them — the `Repository` interface
 * does not offer one, and inventing one for this would be the wrong trade. The
 * failure it would prevent is a saved height with an unsaved weight, which the
 * next save corrects; the cost would be a transaction primitive on the seam
 * that every future adapter, including a network one, would have to honour.
 *
 * `today` and `now` are parameters because a function that reads the clock
 * cannot be tested against a specific day, and this one's whole job is to put a
 * value on the right day.
 */
export async function saveProfileForm(
  repository: Repository,
  input: ProfileFormInput,
  today: IsoDate,
  now: IsoTimestamp,
): Promise<void> {
  await repository.profile.save({
    heightCm: input.heightCm,
    birthDate: input.birthDate,
    sex: input.sex,
    activityFactor: input.activityFactor,
    updatedAt: now,
  });

  // The log is keyed on the date, so saving twice in one day edits today's
  // entry rather than stacking a second. Reading the row first keeps its id and
  // its note, which belong to the day rather than to this particular save.
  const existing = await repository.weight.getByDate(today);
  await repository.weight.put({
    id: existing?.id ?? crypto.randomUUID(),
    date: today,
    weightKg: input.weightKg,
    note: existing?.note,
    recordedAt: now,
  });
}
