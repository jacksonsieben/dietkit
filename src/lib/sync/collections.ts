import type { Repository } from "@/lib/storage/repository";
import type {
  CustomFood,
  Diet,
  IsoTimestamp,
  Profile,
  Settings,
  Snapshot,
  SubstitutionGroup,
  TrainingRotation,
  TrainingSession,
  WeightEntry,
} from "@/lib/storage/types";
import { DEFAULT_SETTINGS } from "@/lib/storage/shared";

/**
 * The eight sets of records sync moves, and the three questions it has to be
 * able to ask about any one of them (#95).
 *
 * `Repository` is eight sub-repositories with eight different shapes, which is
 * right for the screens — `weight.getByDate` means something and
 * `settings.getByDate` does not. Sync needs the opposite view: every record is
 * a collection name, an id and a blob, because that is all a sealed row can be.
 * This file is the one place that translates between the two, so the decorator
 * in `./repository.ts` never grows a switch of its own and a ninth collection
 * is a change here rather than in five places.
 */

export const COLLECTIONS = [
  "profile",
  "weight",
  "diets",
  "customFoods",
  "substitutionGroups",
  "training",
  "trainingSessions",
  "settings",
] as const;

export type CollectionName = (typeof COLLECTIONS)[number];

/**
 * Collections with exactly one record. They get a fixed id rather than a
 * generated one, so that two devices that have both set a profile are writing
 * the same row and merge, instead of ending up with two profiles and no rule.
 */
export const SINGLETONS: ReadonlySet<CollectionName> = new Set([
  "profile",
  "training",
  "settings",
]);

/** The id every singleton uses. The same word the Dexie stores key them by. */
export const SINGLETON_ID = "singleton";

export interface CollectionRecord {
  readonly id: string;
  readonly value: unknown;
}

/**
 * When this record was last written, according to the record itself.
 *
 * Deliberately *not* a new `updatedAt` field on every type. Three collections
 * already carry this timestamp under a name that says more: a weight's
 * `recordedAt` is the moment somebody typed it (the day it is *about* is
 * `date`), and a session's `finishedAt` is when it was written, because a
 * session is written once, at the end. A second field beside those would be two
 * timestamps meaning one thing, and the day they disagreed nobody would know
 * which one the merge used.
 *
 * `settings` returns `undefined` — it is a singleton that is merged patch by
 * patch and has no moment of its own. The journal's write time stands in for
 * it, which means a restored backup's settings beat a newer device's. That is
 * the least valuable record here and the cheapest place to be wrong.
 *
 * **If a session ever becomes editable** (#82, #88), `finishedAt` stops being
 * the write time and this function is where that gets fixed — one place, with a
 * test per collection in `collections.test.ts`.
 */
export function recordUpdatedAt(
  collection: CollectionName,
  value: unknown,
): IsoTimestamp | undefined {
  const record = value as Record<string, unknown>;

  const field =
    collection === "weight"
      ? record.recordedAt
      : collection === "trainingSessions"
        ? record.finishedAt
        : collection === "settings"
          ? undefined
          : record.updatedAt;

  return typeof field === "string" ? field : undefined;
}

/**
 * Every record in one collection, read out of a snapshot.
 *
 * A snapshot rather than eight `list()` calls because `exportAll` is already
 * the one method every adapter must implement (`Repository`'s own comment says
 * why), and because a push wants a consistent read of everything at once.
 */
export function readCollection(
  snapshot: Snapshot,
  collection: CollectionName,
): CollectionRecord[] {
  switch (collection) {
    case "profile":
      return snapshot.profile
        ? [{ id: SINGLETON_ID, value: snapshot.profile }]
        : [];
    case "training":
      return snapshot.training
        ? [{ id: SINGLETON_ID, value: snapshot.training }]
        : [];
    case "settings":
      return [{ id: SINGLETON_ID, value: snapshot.settings }];
    case "weight":
      return snapshot.weight.map((entry) => ({ id: entry.id, value: entry }));
    case "diets":
      return snapshot.diets.map((diet) => ({ id: diet.id, value: diet }));
    case "customFoods":
      return snapshot.customFoods.map((food) => ({ id: food.id, value: food }));
    case "substitutionGroups":
      return snapshot.substitutionGroups.map((group) => ({
        id: group.id,
        value: group,
      }));
    case "trainingSessions":
      return (snapshot.trainingSessions ?? []).map((session) => ({
        id: session.id,
        value: session,
      }));
  }
}

/**
 * Writes one record that came off the wire.
 *
 * Always against the *inner* repository. Going through the decorator would mark
 * the record dirty and push straight back what was just pulled, forever.
 *
 * The casts are the honest cost of a uniform view over eight typed stores. What
 * makes them safe is not the cast: it is that the bytes were sealed by this
 * account's own key and refused by `openEnvelope` if they came from a schema
 * version this build does not understand.
 */
export async function applyRecord(
  repository: Repository,
  collection: CollectionName,
  value: unknown,
): Promise<void> {
  switch (collection) {
    case "profile":
      return repository.profile.save(value as Profile);
    case "training":
      return repository.training.save(value as TrainingRotation);
    case "settings":
      // `patch`, because that is the only writer `SettingsRepository` has — and
      // a merge is the right shape for this record anyway: two devices setting
      // two different preferences should end up with both.
      await repository.settings.patch(value as Settings);
      return;
    case "weight":
      return repository.weight.put(value as WeightEntry);
    case "diets":
      return repository.diets.put(value as Diet);
    case "customFoods":
      return repository.customFoods.put(value as CustomFood);
    case "substitutionGroups":
      return repository.substitutionGroups.put(value as SubstitutionGroup);
    case "trainingSessions":
      return repository.trainingSessions.put(value as TrainingSession);
  }
}

/** Deletes one record that the other device deleted. Same rule about `inner`. */
export async function removeRecord(
  repository: Repository,
  collection: CollectionName,
  id: string,
): Promise<void> {
  switch (collection) {
    case "profile":
      return repository.profile.clear();
    case "training":
      return repository.training.clear();
    case "settings":
      // There is no "delete the settings": an unset store reads back as
      // defaults, so the nearest true thing is to put the defaults back.
      await repository.settings.patch({ ...DEFAULT_SETTINGS });
      return;
    case "weight":
      return repository.weight.remove(id);
    case "diets":
      return repository.diets.remove(id);
    case "customFoods":
      return repository.customFoods.remove(id);
    case "substitutionGroups":
      return repository.substitutionGroups.remove(id);
    case "trainingSessions":
      return repository.trainingSessions.remove(id);
  }
}
