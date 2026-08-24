import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import type { Repository } from "@/lib/storage/repository";

import {
  chooseSplit,
  finishSession,
  loadTraining,
  stopTraining,
} from "./store";

const NOW = "2026-08-24T18:30:00.000Z";
const LATER = "2026-08-26T18:30:00.000Z";

let repository: Repository;

beforeEach(() => {
  repository = createMemoryRepository();
});

describe("loadTraining", () => {
  it("asks for a split on a device that has never chosen one", async () => {
    await expect(loadTraining(repository)).resolves.toEqual({
      status: "choosing",
    });
  });

  it("reads the first session of a split just chosen", async () => {
    await chooseSplit(repository, "abc-3x", NOW);

    const state = await loadTraining(repository);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    expect(state.session.index).toBe(0);
    expect(state.session.split.name).toBe("ABC");
  });

  it("names a split this build no longer has instead of resetting it", async () => {
    await repository.training.save({
      splitSlug: "abc-4x-2019",
      nextDay: 1,
      updatedAt: NOW,
    });

    await expect(loadTraining(repository)).resolves.toEqual({
      status: "unknownSplit",
      splitSlug: "abc-4x-2019",
    });
  });

  it("leaves the unreadable rotation on the device", async () => {
    // Reading a screen is not a reason to write to the store. The slug might
    // be back in the next build, and a load that quietly deleted it would
    // have thrown away the only copy.
    await repository.training.save({
      splitSlug: "abc-4x-2019",
      nextDay: 1,
      updatedAt: NOW,
    });
    await loadTraining(repository);

    await expect(repository.training.get()).resolves.toMatchObject({
      splitSlug: "abc-4x-2019",
    });
  });
});

describe("chooseSplit", () => {
  it("starts the rotation at the first day", async () => {
    await expect(chooseSplit(repository, "abc-3x", NOW)).resolves.toEqual({
      splitSlug: "abc-3x",
      nextDay: 0,
      updatedAt: NOW,
    });
  });

  it("replaces the split that was being run", async () => {
    await chooseSplit(repository, "abc-3x", NOW);
    await finishSession(repository, NOW);
    await chooseSplit(repository, "empurrar-puxar-pernas", LATER);

    const state = await loadTraining(repository);
    if (state.status !== "ready") throw new Error(state.status);
    expect(state.session.split.slug).toBe("empurrar-puxar-pernas");
    // From the top: a new split's day 2 has nothing to do with the old one's.
    expect(state.session.index).toBe(0);
  });
});

describe("finishSession", () => {
  it("moves the rotation on and says where it landed", async () => {
    await chooseSplit(repository, "abc-3x", NOW);

    const state = await finishSession(repository, LATER);
    if (state.status !== "ready") throw new Error(state.status);
    expect(state.session.index).toBe(1);
    expect(state.rotation.lastFinishedAt).toBe(LATER);
  });

  it("writes it, so the next visit starts where this one ended", async () => {
    await chooseSplit(repository, "abc-3x", NOW);
    await finishSession(repository, LATER);

    const state = await loadTraining(repository);
    if (state.status !== "ready") throw new Error(state.status);
    expect(state.session.index).toBe(1);
  });

  it("comes back round to the first day at the end of the split", async () => {
    await chooseSplit(repository, "abc-3x", NOW);
    await finishSession(repository, LATER);
    await finishSession(repository, LATER);
    const state = await finishSession(repository, LATER);

    if (state.status !== "ready") throw new Error(state.status);
    expect(state.session.index).toBe(0);
  });

  it("does nothing dramatic when there is no rotation to move", async () => {
    // A second tap, or a tab left open since before the split was dropped.
    await expect(finishSession(repository, NOW)).resolves.toEqual({
      status: "choosing",
    });
    await expect(repository.training.get()).resolves.toBeUndefined();
  });

  it("refuses to advance a split it cannot read", async () => {
    await repository.training.save({
      splitSlug: "abc-4x-2019",
      nextDay: 1,
      updatedAt: NOW,
    });

    const state = await finishSession(repository, LATER);

    expect(state).toEqual({ status: "unknownSplit", splitSlug: "abc-4x-2019" });
    // Unchanged: there is no split to count days against, so there is no
    // honest number to write.
    await expect(repository.training.get()).resolves.toEqual({
      splitSlug: "abc-4x-2019",
      nextDay: 1,
      updatedAt: NOW,
    });
  });
});

describe("stopTraining", () => {
  it("forgets the rotation and nothing else", async () => {
    await chooseSplit(repository, "abc-3x", NOW);
    await stopTraining(repository);

    await expect(loadTraining(repository)).resolves.toEqual({
      status: "choosing",
    });
  });
});
