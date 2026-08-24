import type { Repository } from "@/lib/storage";
import type {
  IsoTimestamp,
  TrainingRotation,
  TrainingSession,
} from "@/lib/storage/types";

import {
  advanceRotation,
  currentSession,
  rotationSplit,
  startRotation,
  type CurrentSession,
} from "./rotation";

/**
 * The training screen, read from and written to the device (#78).
 *
 * Out of the component for the reason every other store module in here is: the
 * rule about what the screen shows is worth a test, and a rule that lives
 * inside a `useEffect` cannot have one. Nothing in this file is async beyond
 * the two reads it makes — the arithmetic is all in `rotation.ts`, which knows
 * nothing about storage.
 *
 * There are three answers and the screen renders exactly one, in the order of
 * what the user has to do next: choose a split, choose again because the one
 * they had is gone, or train.
 */

export type TrainingState =
  /** No split has been chosen on this device — the ordinary first visit. */
  | { status: "choosing" }
  /**
   * A split was chosen and this build does not have it. Named rather than
   * silently reset: the device is holding a real decision, and quietly
   * dropping someone back onto the chooser with no explanation is how an app
   * loses trust it cannot see it is losing.
   */
  | { status: "unknownSplit"; splitSlug: string }
  | { status: "ready"; session: CurrentSession; rotation: TrainingRotation };

export async function loadTraining(
  repository: Repository,
): Promise<TrainingState> {
  const rotation = await repository.training.get();
  if (!rotation) return { status: "choosing" };

  const split = rotationSplit(rotation);
  if (!split) {
    return { status: "unknownSplit", splitSlug: rotation.splitSlug };
  }

  return { status: "ready", session: currentSession(rotation, split), rotation };
}

/**
 * Everything that has been logged, newest first (#79).
 *
 * A wrapper over one repository call, and here rather than in the component
 * for the same reason the four functions around it are: the screen holds one
 * seam onto storage, and the day the pre-fill needs a window rather than the
 * whole list, there is one place that changes.
 */
export async function loadHistory(
  repository: Repository,
): Promise<TrainingSession[]> {
  return repository.trainingSessions.list();
}

/**
 * Starts a split, from its first day.
 *
 * Choosing the split you are already on restarts the rotation rather than
 * leaving it where it was. That is the honest reading of the only gesture
 * available: the chooser is reached by asking to change split, and picking the
 * same one there is someone saying "start this again".
 */
export async function chooseSplit(
  repository: Repository,
  splitSlug: string,
  now: IsoTimestamp,
): Promise<TrainingRotation> {
  const rotation = startRotation(splitSlug, now);
  await repository.training.save(rotation);
  return rotation;
}

/**
 * Marks the session done: writes what was logged, then moves the rotation on.
 *
 * Returns the state the screen should now show, rather than nothing, so the
 * component has one source for what it renders instead of two. A finish with
 * no rotation to move — a second tap, a stale tab — is not an error: it reads
 * back as whatever the device now says, which is the truth.
 *
 * `record` is what happened (#79), built by `finishedSession` in `log.ts`, and
 * optional because finishing without having checked anything off is a real
 * gesture: the rotation moves and nothing is logged, because nothing happened.
 *
 * The log is written *first*, and written even when the rotation cannot be
 * advanced. Both orderings can fail halfway and only one of them can lose data:
 * a session written whose rotation did not move costs one tap to fix, and a
 * rotation moved whose session was not written is a workout that is gone. The
 * record carries its own `dayName` for exactly this reason — a split this build
 * has dropped is still a split somebody trained.
 */
export async function finishSession(
  repository: Repository,
  now: IsoTimestamp,
  record?: TrainingSession,
): Promise<TrainingState> {
  if (record) await repository.trainingSessions.put(record);

  const rotation = await repository.training.get();
  if (!rotation) return { status: "choosing" };

  const split = rotationSplit(rotation);
  if (!split) {
    return { status: "unknownSplit", splitSlug: rotation.splitSlug };
  }

  const advanced = advanceRotation(rotation, split, now);
  await repository.training.save(advanced);

  return {
    status: "ready",
    session: currentSession(advanced, split),
    rotation: advanced,
  };
}

/** Stops training. The rotation is the only thing there is to forget. */
export async function stopTraining(repository: Repository): Promise<void> {
  await repository.training.clear();
}
