import type { Repository } from "@/lib/storage";
import type { IsoTimestamp, TrainingRotation } from "@/lib/storage/types";

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
 * Marks the session done and moves the rotation on.
 *
 * Returns the state the screen should now show, rather than nothing, so the
 * component has one source for what it renders instead of two. A finish with
 * no rotation to move — a second tap, a stale tab — is not an error: it reads
 * back as whatever the device now says, which is the truth.
 */
export async function finishSession(
  repository: Repository,
  now: IsoTimestamp,
): Promise<TrainingState> {
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
