import fs from "node:fs";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";

import { NEON_AUTH_COLUMNS, compare } from "./accounts";
import { createReferenceDatabase, migrationFiles } from "./pglite.fixture";
import * as schema from "./schema";

/**
 * The server database, migrated for real and then inspected.
 *
 * PGlite is Postgres compiled to WebAssembly, so this applies the checked-in
 * DDL exactly as Neon will and asks the resulting catalog what exists. That
 * matters for the claim this file exists to defend: "no personal-data table"
 * has to be true of the database, not of a TypeScript file that may or may not
 * have been migrated.
 *
 * Until #92 the query filtered on `table_schema = 'public'`. Neon Auth creates
 * its tables in `neon_auth`, so the one schema that is entirely personal data
 * was the one schema the guard would have skipped — with every test still
 * green. It now reads every non-system schema, and a schema nobody wrote a rule
 * for fails on its own (docs/DECISIONS.md § D23).
 */

interface TableColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

let pg: PGlite;
/** Every column in every schema this database is not obliged to have. */
let catalog: TableColumn[];
/** The reference data, which is all `public` is allowed to be. */
let columns: TableColumn[];
let tableNames: string[];

beforeAll(async () => {
  // Applying them in order is the same thing `db:migrate` does.
  expect(migrationFiles().length).toBeGreaterThan(0);
  ({ pg } = await createReferenceDatabase());

  const result = await pg.query<TableColumn>(
    `select table_schema, table_name, column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema not in ('pg_catalog', 'information_schema', 'pg_toast')
        and table_schema not like 'pg\\_temp\\_%'
        and table_schema not like 'pg\\_toast\\_temp\\_%'
      order by table_schema, table_name, ordinal_position`,
  );
  catalog = result.rows;
  columns = catalog.filter((column) => column.table_schema === "public");
  tableNames = [...new Set(columns.map((column) => column.table_name))].sort();
}, 60_000);

/** `table.column`, which is how both allowlists below are written. */
function qualified(rows: TableColumn[]): string[] {
  return rows
    .map((column) => `${column.table_name}.${column.column_name}`)
    .sort();
}

function inSchema(name: string): TableColumn[] {
  return catalog.filter((column) => column.table_schema === name);
}

/**
 * Every schema that has a rule further down this file.
 *
 * The list is here so that adding a schema means writing a rule for it. A new
 * schema with no rule is not "not yet covered", it is a failing test — which is
 * the lesson of `neon_auth` having been invisible to this file by default.
 */
const KNOWN_SCHEMAS = new Set([
  "public", // Reference data: TACO, the exercise catalog, the presets.
  "neon_auth", // Accounts. Created and owned by Neon, not by our migrations.
  "sync", // Encrypted rows. Opaque to the server by construction (#95).
]);

/**
 * Every table `public` is allowed to have.
 *
 * An allowlist, not a denylist, because a denylist can be walked around by
 * naming a table `w_log` and a person's weight is still a person's weight. To
 * add a table here you have to look at this comment first — which is the whole
 * mechanism. Personal data belongs in IndexedDB behind `src/lib/storage`
 * (docs/DECISIONS.md § D1), or, once it syncs, encrypted in `sync`.
 */
const ALLOWED_TABLES = [
  "dataset_versions",
  "diet_preset_items",
  "diet_preset_meals",
  "diet_presets",
  "exercises",
  "food_groups",
  "foods",
  "training_preset_days",
  "training_preset_items",
  "training_presets",
].sort();

/**
 * Words that have no business in reference data. Matched against `snake_case`
 * segments, so `age` does not fire on `storage` and `sets` does not fire on
 * `session` — the check is meant to be precise enough to be left on.
 *
 * It applies to `public` only. `neon_auth` is made of these words by
 * definition, which is exactly why it gets a named allowlist instead.
 */
const PERSONAL_SEGMENTS = new Set([
  "account",
  "age",
  "bmi",
  "birth",
  "birthdate",
  "bodyfat",
  "consent",
  "cpf",
  "device",
  "email",
  "gender",
  "height",
  "ip",
  "kg",
  "latitude",
  "longitude",
  "owner",
  "password",
  "patient",
  "phone",
  "profile",
  "secret",
  "session",
  "sex",
  "tdee",
  "token",
  "user",
  "users",
  "weight",
  "weights",
]);

/**
 * The only column names the sync schema may use — the opposite kind of rule to
 * `PERSONAL_SEGMENTS`. Not "no bad columns": *only these columns*.
 *
 * A name is data. `collection_name` would tell the server that this person
 * tracks weight without storing one, and `row_count_hint` would hand it the
 * shape of a diet. Neither is a bad-faith addition; both would be well meant,
 * and both fail here (docs/DECISIONS.md § D23).
 */
const SYNC_COLUMNS = new Set([
  "account_id", // Whose rows these are. The only link to `neon_auth`.
  "collection", // Which set of rows, as an opaque string the client chooses.
  "record_id", // Which row, opaque. Generated on the device.
  "ciphertext", // The record. Unreadable here, and that is the product.
  "nonce", // Per-record, never reused.
  "updated_at", // Server clock, for the last-writer-wins merge (#95).
  "rev", // Monotonic per record, so a stale device loses rather than clobbers.
  "device_id", // Which device wrote it. Random, local, not a fingerprint.
  "deleted_at", // A tombstone: deletion has to sync too, or it un-deletes.
]);

function segments(identifier: string): string[] {
  return identifier.split("_");
}

function personalSegments(identifier: string): string[] {
  return segments(identifier).filter((segment) =>
    PERSONAL_SEGMENTS.has(segment),
  );
}

describe("server database schemas", () => {
  it("has a rule for every schema it contains", () => {
    const present = [...new Set(catalog.map((c) => c.table_schema))].sort();

    // The failure that started #92 was silent: a schema nobody had written a
    // rule for simply was not checked. Here it is loud instead.
    expect(present.filter((name) => !KNOWN_SCHEMAS.has(name))).toEqual([]);
  });
});

describe("reference data (public)", () => {
  it("applies its migrations to a real Postgres", () => {
    // Not a tautology: a broken CREATE TABLE fails in beforeAll, which is the
    // only proof available that the checked-in SQL runs without a Neon branch.
    expect(tableNames.length).toBe(ALLOWED_TABLES.length);
  });

  it("contains exactly the allowed tables", () => {
    expect(tableNames).toEqual(ALLOWED_TABLES);
  });

  it("has no table whose name suggests it belongs to a person", () => {
    for (const table of tableNames) {
      expect(personalSegments(table), `table ${table}`).toEqual([]);
    }
  });

  it("has no column whose name suggests it belongs to a person", () => {
    // Catches the other direction: an allowed table growing an `owner_email`.
    for (const column of columns) {
      expect(
        personalSegments(column.column_name),
        `${column.table_name}.${column.column_name}`,
      ).toEqual([]);
    }
  });

  it("matches the Drizzle schema it was generated from", () => {
    // Fails when src/lib/db/schema is edited without running `db:generate`, so
    // the migration a reviewer reads is the migration the app expects.
    // The barrel exports enums and `relations()` too; `is` is what tells a
    // table from those at runtime, and narrowing here beats a cast.
    const fromCode: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      for (const column of Object.values(getTableColumns(value))) {
        fromCode.push(`${getTableName(value)}.${column.name}`);
      }
    }
    fromCode.sort();

    expect(qualified(columns)).toEqual(fromCode);
  });
});

describe("accounts (neon_auth)", () => {
  it("keeps only what Better Auth needs, and nothing it merely offers", () => {
    // `unexplained` only: Neon creates this schema, our migrations do not, so
    // in the fixture it is empty and every declared column is legitimately
    // missing. The real comparison needs a real branch and lives in
    // scripts/db/audit-accounts.ts; this is the half that can run in CI.
    expect(compare(qualified(inSchema("neon_auth"))).unexplained).toEqual([]);
  });

  it("notices a column nobody wrote down", () => {
    // The upgrade this file exists for: a managed beta grows a field, and the
    // first person to hear about it should be a reviewer, not a regulator.
    expect(compare(["user.email", "user.fullName"])).toEqual(
      expect.objectContaining({ unexplained: ["user.fullName"] }),
    );
  });

  it("notices a column that was declared and is no longer there", () => {
    // The other direction, which the audit script acts on: a list describing a
    // database that has moved on is how this stops being a check at all.
    expect(compare([...NEON_AUTH_COLUMNS]).missing).toEqual([]);
    expect(
      compare([...NEON_AUTH_COLUMNS].filter((c) => c !== "user.email")).missing,
    ).toEqual(["user.email"]);
  });
});

describe("encrypted rows (sync)", () => {
  it("has no column that says anything about what it holds", () => {
    const speaking = inSchema("sync")
      .map((column) => column.column_name)
      .filter((name) => !SYNC_COLUMNS.has(name))
      .sort();

    expect(speaking).toEqual([]);
  });

  it("has no table whose name says it either", () => {
    // `sync.rows` is fine. `sync.weights` would announce, in the table name,
    // the thing the ciphertext was there to hide.
    const tables = [...new Set(inSchema("sync").map((c) => c.table_name))];
    for (const table of tables) {
      expect(personalSegments(table), `sync.${table}`).toEqual([]);
    }
  });
});

/**
 * Words that would turn the backup file into a record about an account rather
 * than a file belonging to a person. Not the same list as `PERSONAL_SEGMENTS`:
 * a `Snapshot` is *made of* personal data on purpose, because it is the only
 * backup this architecture offers (docs/SCOPE.md § 3). What it must not carry
 * is an identity (docs/DECISIONS.md § D23).
 */
const IDENTITY_SEGMENTS = new Set([
  "account",
  "device",
  "email",
  "server",
  "session",
  "subject",
  "token",
  "uid",
  "user",
]);

const SNAPSHOT_TYPES = path.resolve(import.meta.dirname, "../storage/types.ts");

/** The field names of `interface Snapshot`, read from the source that declares
 *  it — a type has no runtime shape to interrogate, and an optional field is
 *  exactly the kind that would be missing from an example object. */
function snapshotFields(): string[] {
  const source = fs.readFileSync(SNAPSHOT_TYPES, "utf8");
  const body = /export interface Snapshot \{\n([\s\S]*?)\n\}/.exec(source)?.[1];
  expect(body, "interface Snapshot not found in storage/types.ts").toBeTypeOf(
    "string",
  );

  return [...(body ?? "").matchAll(/^ {2}(\w+)\??:/gm)].map(
    (match) => match[1] as string,
  );
}

describe("the export file", () => {
  it("is read from the source that declares it", () => {
    // Guards the regex above: a silent zero matches would make the next test
    // pass for the wrong reason, permanently.
    expect(snapshotFields()).toEqual(
      expect.arrayContaining(["schemaVersion", "weight", "diets", "settings"]),
    );
  });

  it("carries no account id, user id or device id", () => {
    for (const field of snapshotFields()) {
      const parts = field
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase()
        .split("_");

      expect(
        parts.filter((part) => IDENTITY_SEGMENTS.has(part)),
        `Snapshot.${field}`,
      ).toEqual([]);
    }
  });
});

describe("food composition columns", () => {
  it("stores every nutrient as exact numeric, nullable", async () => {
    const nutrients = columns.filter(
      (column) => column.table_name === "foods" && column.data_type === "numeric",
    );

    // 26 published nutrient columns. Exact decimal because the values are
    // quotations, not measurements of our own — see schema/foods.ts.
    expect(nutrients).toHaveLength(26);
    for (const column of nutrients) {
      // Nullable is load-bearing: `NA` and `Tr` are stored as NULL plus a
      // sentinel rather than as 0, which a NOT NULL column would force.
      expect(column.is_nullable, `foods.${column.column_name}`).toBe("YES");
    }
  });

  it("keeps the sentinel map non-null so a row never has to be guessed at", async () => {
    const sentinels = columns.find(
      (column) =>
        column.table_name === "foods" && column.column_name === "sentinels",
    );

    expect(sentinels?.data_type).toBe("jsonb");
    expect(sentinels?.is_nullable).toBe("NO");
  });

  it("accepts a published row verbatim, NA and Tr included", async () => {
    // Food 1, "Arroz, integral, cozido", whose cholesterol cell reads NA.
    await pg.exec(`
      insert into dataset_versions
        (dataset, edition, sha256, file_bytes, row_count, source_url, citation, retrieved_at)
      values ('taco', '4a', 'abc', 1, 1, 'https://example.test', 'citation', '2026-08-17');
      insert into food_groups (slug, name, position)
      values ('cereais-e-derivados', 'Cereais e derivados', 1);
      insert into foods
        (id, group_slug, description, search_text, moisture_percent, energy_kcal,
         protein_g, fat_g, carb_g, sentinels, dataset_version_id)
      values
        (1, 'cereais-e-derivados', 'Arroz, integral, cozido',
         'arroz, integral, cozido', 70.1, 124, 2.6, 1.0, 25.8,
         '{"cholesterolMg":"NA"}'::jsonb, 1);
    `);

    const stored = await pg.query<{
      moisture_percent: string;
      cholesterol_mg: string | null;
      sentinels: unknown;
    }>(`select moisture_percent, cholesterol_mg, sentinels from foods where id = 1`);

    // 70.1 comes back as 70.1, not 70.09999999999999 — the point of numeric.
    expect(Number(stored.rows[0]?.moisture_percent)).toBe(70.1);
    expect(stored.rows[0]?.cholesterol_mg).toBeNull();
    expect(stored.rows[0]?.sentinels).toEqual({ cholesterolMg: "NA" });
  });

  it("refuses a preset item pointing at a food that does not exist", async () => {
    await pg.exec(`
      insert into diet_presets (slug, name, description)
      values ('teste', 'Teste', 'Teste');
      insert into diet_preset_meals (preset_slug, position, name)
      values ('teste', 1, 'Café da manhã');
    `);
    const meal = await pg.query<{ id: number }>(
      `select id from diet_preset_meals where preset_slug = 'teste'`,
    );

    // The reason presets are relational rather than one JSONB blob: a template
    // referring to a food that isn't there fails here, not in front of a user.
    await expect(
      pg.exec(`
        insert into diet_preset_items (meal_id, position, food_id, quantity_g, min_g, max_g)
        values (${meal.rows[0]?.id}, 1, 9999, 100, 50, 200);
      `),
    ).rejects.toThrow(/foreign key/i);
  });
});
