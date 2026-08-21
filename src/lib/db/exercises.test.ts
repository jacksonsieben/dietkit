import { asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import {
  catalogRows,
  EQUIPMENT,
  EXERCISE_COUNT,
  MUSCLE_GROUPS,
} from "@/lib/training/catalog";

import { createReferenceDatabase, type ReferenceDatabase } from "./pglite.fixture";
import { equipment, exercises, muscleGroup } from "./schema";

/**
 * The catalog against the table it is seeded into (#72).
 *
 * Two copies of the same twelve strings exist on purpose: the Postgres enums in
 * schema/exercises.ts, and the plain unions in src/lib/training/catalog.ts.
 * They are not shared because the catalog ships in the client bundle and a file
 * in the bundle may not import drizzle (eslint.config.mjs) — one such import is
 * how a database driver ends up in a browser. So the copies are held together
 * here instead, in the one tree that is allowed to see both.
 *
 * The insert is the other half. A slug that is fine in TypeScript and invalid
 * as an enum value fails at `db:seed`, against a real Neon branch, at the point
 * where it is least convenient to find out; running the catalog through PGlite
 * moves that failure into the test suite.
 */

let fixture: ReferenceDatabase;

beforeAll(async () => {
  fixture = await createReferenceDatabase();
}, 60_000);

describe("the exercise catalog and its table", () => {
  it("names the same muscle groups in the same order", () => {
    // Order and all: `position` is a rank within a group, so the groups
    // themselves are ordered by the enum, and a reordered enum silently
    // reshuffles every screen that lists them.
    expect([...MUSCLE_GROUPS]).toEqual([...muscleGroup.enumValues]);
  });

  it("names the same equipment in the same order", () => {
    expect([...EQUIPMENT]).toEqual([...equipment.enumValues]);
  });

  it("takes the whole catalog into Postgres", async () => {
    const { db } = fixture;
    const rows = catalogRows();

    await db.insert(exercises).values(rows);

    const stored = await db
      .select()
      .from(exercises)
      .orderBy(asc(exercises.primaryMuscle), asc(exercises.position));

    expect(stored).toHaveLength(EXERCISE_COUNT);
    // Round-tripped rather than counted: this is what the seed will write and
    // what a preset's foreign key will point at.
    expect(new Set(stored.map((row) => row.slug))).toEqual(
      new Set(rows.map((row) => row.slug)),
    );
  });

  it("keeps a group's order intact through the position column", async () => {
    // The claim `position` exists to make: ordering by it inside a group gives
    // back the order the catalog was written in, which is compound first.
    const { db } = fixture;

    const peito = await db
      .select({ slug: exercises.slug })
      .from(exercises)
      .where(eq(exercises.primaryMuscle, "peito"))
      .orderBy(asc(exercises.position));

    const authored = catalogRows()
      .filter((row) => row.primaryMuscle === "peito")
      .map((row) => ({ slug: row.slug }));

    expect(peito).toEqual(authored);
  });
});

