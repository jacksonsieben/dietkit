import { beforeEach, describe, expect, it } from "vitest";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "../../src/lib/db/pglite.fixture.ts";
import { datasetVersions, exercises } from "../../src/lib/db/schema/index.ts";
import { EXERCISE_COUNT } from "../../src/lib/training/catalog.ts";
import { writeCatalog } from "./write.ts";

/**
 * The seed, run against a real Postgres (#72).
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
