import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "../../src/lib/db/pglite.fixture.ts";
import {
  datasetVersions,
  exercises,
  trainingPresetDays,
  trainingPresetItems,
  trainingPresets,
} from "../../src/lib/db/schema/index.ts";
import { EXERCISE_COUNT } from "../../src/lib/training/catalog.ts";
import { SPLIT_COUNT, SPLITS } from "../../src/lib/training/splits.ts";
import { writeCatalog, writeSplits } from "./write.ts";

/**
 * The seed, run against a real Postgres (#72, #74).
 *
 * A seed is the one kind of code whose only production run is against the
 * database it would be worst to get wrong, so the write lives in write.ts and
 * takes its connection as an argument, and this puts it through PGlite with the
 * checked-in migrations applied — the same arrangement `foods.test.ts` uses to
 * test the search SQL rather than a mock's opinion of it.
 *
 * The property worth having is that running it twice leaves what running it
 * once did: it runs once per Neon branch (README § Reference database) and
 * there is no "reset the preview database" step to forget.
 */
const SOURCE = { sha256: "a".repeat(64), fileBytes: 12_345 };

describe("the exercise seed", () => {
  let reference: ReferenceDatabase;

  beforeEach(async () => {
    reference = await createReferenceDatabase();
  }, 60_000);

  it("writes the catalog and its provenance", async () => {
    const written = await writeCatalog(reference.db, SOURCE);

    expect(written.rowCount).toBe(EXERCISE_COUNT);
    expect(await reference.db.select().from(exercises)).toHaveLength(
      EXERCISE_COUNT,
    );

    const [version] = await reference.db.select().from(datasetVersions);

    expect(version).toMatchObject({
      dataset: "dietkit-exercises",
      sha256: SOURCE.sha256,
      fileBytes: SOURCE.fileBytes,
      rowCount: EXERCISE_COUNT,
    });
    expect(version!.citation).toContain("DIETKIT");
  });

  it("leaves the second run looking exactly like the first", async () => {
    const first = await writeCatalog(reference.db, SOURCE);
    const second = await writeCatalog(reference.db, SOURCE);

    expect(second.versionId).toBe(first.versionId);
    expect(await reference.db.select().from(datasetVersions)).toHaveLength(1);
    expect(await reference.db.select().from(exercises)).toHaveLength(
      EXERCISE_COUNT,
    );
    expect(second.removed).toEqual([]);
  });

  it("keeps a slug's identity while updating what is printed against it", async () => {
    await writeCatalog(reference.db, SOURCE);
    await reference.pg.exec(
      `update exercises set name = 'Errado', position = 99`,
    );

    await writeCatalog(reference.db, SOURCE);

    const [row] = await reference.db.select().from(exercises).limit(1);

    expect(row!.name).not.toBe("Errado");
    expect(row!.position).not.toBe(99);
  });

  it("sweeps out a slug the catalog no longer has", async () => {
    // Written straight into the table rather than through the catalog, because
    // this is the case the sweep exists for: a row seeded by an older build.
    await reference.pg.exec(
      `insert into exercises (slug, name, primary_muscle, equipment, position)
       values ('supino-em-marte', 'Supino em Marte', 'peito', 'barra', 0)`,
    );

    const written = await writeCatalog(reference.db, SOURCE);

    expect(written.removed).toEqual(["supino-em-marte"]);
    expect(await reference.db.select().from(exercises)).toHaveLength(
      EXERCISE_COUNT,
    );
  });

  it("refuses to drop an exercise a preset still points at", async () => {
    // The foreign key is the whole reason these rows are in Postgres, so the
    // sweep has to fail loudly rather than take a preset's target with it.
    await reference.pg.exec(
      `insert into exercises (slug, name, primary_muscle, equipment, position)
       values ('supino-em-marte', 'Supino em Marte', 'peito', 'barra', 0);
       insert into training_presets (slug, name, description, position)
       values ('marte', 'Marte', 'Treino de Marte', 0);
       insert into training_preset_days (preset_slug, position, name)
       values ('marte', 0, 'Sol');
       insert into training_preset_items
         (day_id, position, exercise_slug, sets, rep_min, rep_max, rest_seconds)
       select id, 0, 'supino-em-marte', 3, 8, 12, 90 from training_preset_days`,
    );

    await expect(writeCatalog(reference.db, SOURCE)).rejects.toThrow();
  });
});

/**
 * The splits, against the same real Postgres (#74).
 *
 * These have one property the exercise seed does not: they only work if
 * something else ran first. `training_preset_items.exercise_slug` is a foreign
 * key, so a split written into an empty database is a failed transaction — the
 * last test here is the reason `npm run db:seed:training` is one command that
 * does both rather than two a person runs in the right order.
 */
describe("the splits seed", () => {
  let reference: ReferenceDatabase;

  const SPLIT_SOURCE = { sha256: "b".repeat(64), fileBytes: 54_321 };

  const seed = async () => {
    await writeCatalog(reference.db, SOURCE);
    return writeSplits(reference.db, SPLIT_SOURCE);
  };

  beforeEach(async () => {
    reference = await createReferenceDatabase();
  }, 60_000);

  it("writes every split, every day and every item", async () => {
    const written = await seed();

    expect(written.presetCount).toBe(SPLIT_COUNT);
    expect(await reference.db.select().from(trainingPresets)).toHaveLength(
      SPLIT_COUNT,
    );
    expect(await reference.db.select().from(trainingPresetDays)).toHaveLength(
      written.dayCount,
    );
    expect(await reference.db.select().from(trainingPresetItems)).toHaveLength(
      written.itemCount,
    );
  });

  it("records where the splits came from, separately from the catalog", async () => {
    await seed();

    const versions = await reference.db.select().from(datasetVersions);
    const splits = versions.find((row) => row.dataset === "dietkit-splits");

    expect(versions).toHaveLength(2);
    expect(splits).toMatchObject({ sha256: SPLIT_SOURCE.sha256 });
    expect(splits!.citation).toContain("DIETKIT");
  });

  it("leaves the second run looking exactly like the first", async () => {
    const first = await seed();
    const second = await writeSplits(reference.db, SPLIT_SOURCE);

    // The days are rewritten, so their ids move; what must not move is how
    // many of them there are. A missing delete shows up here as double.
    expect(second.versionId).toBe(first.versionId);
    expect(await reference.db.select().from(trainingPresetDays)).toHaveLength(
      first.dayCount,
    );
    expect(await reference.db.select().from(trainingPresetItems)).toHaveLength(
      first.itemCount,
    );
  });

  it("keeps each day's exercises in the order the file lists them", async () => {
    await seed();

    const [split] = SPLITS;
    const [day] = await reference.db
      .select()
      .from(trainingPresetDays)
      .where(eq(trainingPresetDays.presetSlug, split!.slug))
      .orderBy(trainingPresetDays.position);

    const items = await reference.db
      .select()
      .from(trainingPresetItems)
      .where(eq(trainingPresetItems.dayId, day!.id))
      .orderBy(trainingPresetItems.position);

    expect(day!.name).toBe(split!.days[0]!.name);
    expect(items.map((item) => item.exerciseSlug)).toEqual(
      split!.days[0]!.items.map((item) => item.exercise),
    );
    expect(items[0]).toMatchObject({
      sets: split!.days[0]!.items[0]!.sets,
      repMin: split!.days[0]!.items[0]!.reps[0],
      repMax: split!.days[0]!.items[0]!.reps[1],
    });
  });

  it("sweeps out a split the file no longer has, days and items included", async () => {
    await reference.pg.exec(
      `insert into training_presets (slug, name, description, position)
       values ('ficha-antiga', 'Ficha antiga', 'De um build anterior', 0);
       insert into training_preset_days (preset_slug, position, name)
       values ('ficha-antiga', 0, 'Segunda')`,
    );

    const written = await seed();

    expect(written.removed).toEqual(["ficha-antiga"]);
    expect(await reference.db.select().from(trainingPresets)).toHaveLength(
      SPLIT_COUNT,
    );
    // Cascaded, not orphaned: every day left belongs to a split in the file.
    const days = await reference.db.select().from(trainingPresetDays);
    expect(days.every((day) => day.presetSlug !== "ficha-antiga")).toBe(true);
  });

  it("will not write a split before the exercises it points at", async () => {
    await expect(writeSplits(reference.db, SPLIT_SOURCE)).rejects.toThrow();
  });
});

/**
 * The script, started the way npm starts it.
 *
 * Everything above imports write.ts, which vitest resolves with a bundler's
 * rules — extensionless relative imports and all. `npm run db:seed:training`
 * is plain `node`, which has no such rules, and the difference is not
 * theoretical: splits.ts shipped importing "./catalog", every test and the
 * typecheck passed, and the seed died on ERR_MODULE_NOT_FOUND the first time
 * it was pointed at a real database. Hence the `.ts` extensions throughout
 * src/lib/db/schema — the same reason, found earlier.
 *
 * Getting as far as the missing-connection message means every import in the
 * graph resolved under Node. That is the whole assertion.
 */
describe("the seed script", () => {
  it("loads under plain node, the way npm run db:seed:training does", async () => {
    const script = fileURLToPath(new URL("./seed.ts", import.meta.url));
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_UNPOOLED;

    const failure = await promisify(execFile)(process.execPath, [script], {
      env,
    }).catch((error: { stderr: string }) => error);

    expect(failure.stderr).toContain("DATABASE_URL_UNPOOLED is not set");
  }, 30_000);
});
