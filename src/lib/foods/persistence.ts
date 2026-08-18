import type { Repository } from "@/lib/storage";
import type { CustomFood, Id, IsoTimestamp } from "@/lib/storage/types";

import { toCustomFood, type CustomFoodInput } from "./custom";

/**
 * Moving a custom food between the form and the device's store (#17).
 *
 * Out of the component for the reason `saveProfileForm` is: the decision worth
 * testing is what an *edit* means, and it should be observable without a
 * browser. Takes a `Repository`, so the tests run against a real adapter.
 */

/**
 * Writes a food, keeping the identity of the one being edited.
 *
 * `editing` is the whole point. A `Diet` stores foods by reference
 * (`{ source: "custom", customFoodId }`), so an "edit" that minted a new id
 * would leave every meal pointing at the version being replaced — the plan
 * would keep the old macros while the food list showed the new ones, and
 * nothing on screen would look wrong.
 *
 * `createdAt` is read back rather than passed in, because it belongs to the
 * record and not to this save. If the record is gone — deleted in another tab
 * between opening the form and submitting it — the id is kept anyway and the
 * food comes back under it: a plan that still references it is worth more than
 * an insistence that the row must have existed.
 */
export async function saveCustomFood(
  repository: Repository,
  input: CustomFoodInput,
  editing: Id | undefined,
  now: IsoTimestamp,
): Promise<CustomFood> {
  const existing = editing === undefined ? undefined : await repository.customFoods.get(editing);

  const food = toCustomFood(
    input,
    {
      id: editing ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
    },
    now,
  );

  await repository.customFoods.put(food);
  return food;
}
