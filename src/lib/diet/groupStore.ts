import type { Repository } from "@/lib/storage";
import type { Id, IsoTimestamp, SubstitutionGroup } from "@/lib/storage/types";

import { toGroup, type GroupInput } from "./groups";

/**
 * Moving a substitution group between the form and the device's store (#20).
 *
 * Out of the component for `saveCustomFood`'s reason, and it keeps that
 * function's one non-obvious rule: an edit keeps the id, because every slot
 * that draws from this group points at it by id. Minting a new one would leave
 * those slots referring to the group that was replaced — the swap list on
 * screen would keep offering yesterday's foods, and nothing would look wrong.
 */
export async function saveGroup(
  repository: Repository,
  input: GroupInput,
  editing: Id | undefined,
  now: IsoTimestamp,
): Promise<SubstitutionGroup> {
  const existing =
    editing === undefined
      ? undefined
      : await repository.substitutionGroups.get(editing);

  const group = toGroup(
    input,
    { id: editing ?? crypto.randomUUID(), createdAt: existing?.createdAt ?? now },
    now,
  );

  await repository.substitutionGroups.put(group);
  return group;
}

/**
 * Deletes the group and leaves the plans alone.
 *
 * A slot that pointed at it keeps its `substitutionGroupId`, and the planner
 * treats a group it cannot find as no group at all: the food stays on the
 * plate, the swap control disappears. The alternative — rewriting every diet
 * on the device to strip the reference — would be a bulk edit of the user's
 * plans as a side effect of tidying a list, and it would silently undo itself
 * if the group came back.
 */
export async function deleteGroup(
  repository: Repository,
  id: Id,
): Promise<void> {
  await repository.substitutionGroups.remove(id);
}
