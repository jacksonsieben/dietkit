import fs from "node:fs";
import path from "node:path";

import type { PGlite } from "@electric-sql/pglite";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
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
  "diet_preset_group_foods",
  "diet_preset_groups",
  "diet_preset_items",
  "diet_preset_meals",
  "diet_preset_option_sets",
  "diet_preset_options",
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
 * The only column names each table in the sync schema may use — the opposite
 * kind of rule to `PERSONAL_SEGMENTS`. Not "no bad columns": *only these
 * columns*, table by table.
 *
 * A name is data. `collection_name` would tell the server that this person
 * tracks weight without storing one, and `row_count_hint` would hand it the
 * shape of a diet. Neither is a bad-faith addition; both would be well meant,
 * and both fail here (docs/DECISIONS.md § D23).
 *
 * Per table since #96, because the schema stopped being one table. A table
 * with no entry here fails on its own, the same way a schema with no rule
 * fails: `vault` may hold key material and `consent` may hold two dates, and
 * neither of them may hold a column that `rows` was refused.
 */
const SYNC_TABLES: Readonly<Record<string, ReadonlySet<string>>> = {
  rows: new Set([
    "account_id", // Whose rows these are. The only link to `neon_auth`.
    "collection", // Which set of rows, as an opaque string the client chooses.
    "record_id", // Which row, opaque. Generated on the device.
    "ciphertext", // The record. Unreadable here, and that is the product.
    "nonce", // Per-record, never reused.
    "updated_at", // Server clock, for the last-writer-wins merge (#95).
    "rev", // Monotonic per record, so a stale device loses rather than clobbers.
    "deleted_at", // A tombstone: deletion has to sync too, or it un-deletes.
  ]),
  vault: new Set([
    "account_id",
    "version", // The envelope format. A newer one is refused, not guessed at.
    "kdf", // "PBKDF2-SHA256". Stored so a later scheme can coexist with it.
    "iterations", // Stored, because raising it must not orphan old vaults.
    "salt", // Not a secret: an anti-rainbow-table, useless without the secret.
    "passphrase_nonce",
    "passphrase_ciphertext", // The data key, sealed under the passphrase.
    "recovery_nonce",
    "recovery_ciphertext", // The same key, sealed under the recovery code.
  ]),
  consent: new Set([
    "account_id",
    "notice", // Which version of the notice was on screen. See #96.
    "consented_at",
    "revoked_at", // Withdrawal is an event (GDPR art. 7(3)), not an absence.
  ]),
};

/**
 * `sync.consent` is allowed to say what it is, and it is the only one.
 *
 * The table-name rule below asks whether a name describes what is inside a
 * record — `sync.weights` would announce, in the table name, the thing the
 * ciphertext was there to hide. `consent` describes no record. It is the legal
 * fact that permits the records to exist, and LGPD art. 8 § 2 puts the burden
 * of proving it on the controller: a table that cannot be found is a proof
 * that cannot be produced. Naming it honestly costs nothing, because what it
 * holds — a date, a date, and the effective date of a public web page — is
 * already true of every account that turned sync on.
 */
const SYNC_NAMES_A_FACT = new Set(["consent"]);

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

  it("matches the Drizzle schema it was generated from", () => {
    // Fails when src/lib/db/schema is edited without running `db:generate`, so
    // the migration a reviewer reads is the migration the app expects.
    // The barrel exports enums and `relations()` too; `is` is what tells a
    // table from those at runtime, and narrowing here beats a cast.
    //
    // Qualified by schema since #95, because `sync.rows` and a hypothetical
    // `public.rows` are different tables and a check that could not tell them
    // apart would go on passing while the encrypted one drifted. `neon_auth`
    // is excluded: Neon creates it, this codebase does not declare it, and it
    // has its own comparison below.
    const fromCode: string[] = [];
    for (const value of Object.values(schema)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      for (const column of table.columns) {
        fromCode.push(
          `${table.schema ?? "public"}.${table.name}.${column.name}`,
        );
      }
    }

    const fromDatabase = catalog
      .filter((column) => column.table_schema !== "neon_auth")
      .map((c) => `${c.table_schema}.${c.table_name}.${c.column_name}`);

    expect(fromDatabase.sort()).toEqual(fromCode.sort());
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
      .filter(
        (column) => !SYNC_TABLES[column.table_name]?.has(column.column_name),
      )
      .map((column) => `${column.table_name}.${column.column_name}`)
      .sort();

    expect(speaking).toEqual([]);
  });

  it("has a rule for every table it contains", () => {
    // The same lesson as `KNOWN_SCHEMAS`, one level down: a table nobody wrote
    // an allowlist for must not be quietly waved through by a filter that only
    // knows about the tables it already had.
    const tables = [...new Set(inSchema("sync").map((c) => c.table_name))];

    expect(tables.filter((table) => !(table in SYNC_TABLES))).toEqual([]);
  });

  it("has no table whose name says what a record contains", () => {
    // `sync.rows` is fine. `sync.weights` would announce, in the table name,
    // the thing the ciphertext was there to hide. `sync.consent` is the named
    // exception, and the reason is written where the exception is.
    const tables = [...new Set(inSchema("sync").map((c) => c.table_name))];
    for (const table of tables) {
      if (SYNC_NAMES_A_FACT.has(table)) continue;
      expect(personalSegments(table), `sync.${table}`).toEqual([]);
    }
  });

  it("exists, so the rules above are about something", () => {
    // Until #95 this schema was empty and the checks above passed by having
    // nothing to look at. A guard that is satisfied by absence is not a guard.
    const present = inSchema("sync")
      .map((column) => `${column.table_name}.${column.column_name}`)
      .sort();
    const declared = Object.entries(SYNC_TABLES)
      .flatMap(([table, names]) => [...names].map((name) => `${table}.${name}`))
      .sort();

    expect(present).toEqual(declared);
  });

  it("never stores a record it could not have sealed", async () => {
    // `ciphertext` and `nonce` are NOT NULL, deletion included: a tombstone is
    // a sealed record saying "gone", not a row with the bytes left out. An
    // empty ciphertext would be the one row on the server that says something.
    await expect(
      pg.exec(`
        insert into sync.rows (account_id, collection, record_id, nonce)
        values ('acc', 'weight', 'rec', 'AAAAAAAAAAAAAAAA');
      `),
    ).rejects.toThrow(/null value|not-null/i);
  });

  it("keeps one row per record per account, and lets the other one lose", async () => {
    // The primary key is what makes a push an upsert rather than an append —
    // without it two devices writing the same record would leave two rows and
    // the pull would have to guess.
    await pg.exec(`
      insert into sync.rows
        (account_id, collection, record_id, ciphertext, nonce)
      values ('acc', 'weight', 'rec', 'c1', 'n1');
    `);

    await expect(
      pg.exec(`
        insert into sync.rows
          (account_id, collection, record_id, ciphertext, nonce)
        values ('acc', 'weight', 'rec', 'c2', 'n2');
      `),
    ).rejects.toThrow(/duplicate key/i);

    // Same record id, different account: a different row, never a collision.
    await pg.exec(`
      insert into sync.rows
        (account_id, collection, record_id, ciphertext, nonce)
      values ('other', 'weight', 'rec', 'c3', 'n3');
    `);

    const mine = await pg.query<{ count: number }>(
      `select count(*)::int as count from sync.rows where account_id = 'acc'`,
    );
    expect(mine.rows[0]?.count).toBe(1);
  });

  it("stamps the write clock itself", async () => {
    // The cursor a pull walks. A client-supplied value would let a device with
    // a wrong clock either re-send everything forever or be skipped entirely.
    const stored = await pg.query<{ updated_at: Date; rev: number }>(
      `select updated_at, rev from sync.rows where account_id = 'acc'`,
    );

    expect(stored.rows[0]?.updated_at).toBeInstanceOf(Date);
    expect(stored.rows[0]?.rev).toBe(1);
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
      (column) =>
        column.table_name === "foods" && column.data_type === "numeric",
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
    }>(
      `select moisture_percent, cholesterol_mg, sentinels from foods where id = 1`,
    );

    // 70.1 comes back as 70.1, not 70.09999999999999 — the point of numeric.
    expect(Number(stored.rows[0]?.moisture_percent)).toBe(70.1);
    expect(stored.rows[0]?.cholesterol_mg).toBeNull();
    expect(stored.rows[0]?.sentinels).toEqual({ cholesterolMg: "NA" });
  });

  it("refuses a preset item pointing at a food that does not exist", async () => {
    await pg.exec(`
      insert into diet_presets (slug, name, description)
      values ('teste', 'Teste', 'Teste');
      insert into diet_preset_meals (preset_slug, position, name, share)
      values ('teste', 1, 'Café da manhã', 1.0);
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

/**
 * The tables #112 added, exercised against the migrated database rather than
 * described in prose.
 *
 * Everything here is a claim the schema makes and the seed will lean on: a
 * group lists real foods, a set has one default, positions number per
 * container, and none of it outlives the preset it belongs to. A comment
 * saying so is a wish; a failing insert is the guarantee.
 */
describe("preset groups and option sets", () => {
  /** The one preset these tests build, torn down by the last of them. */
  const SLUG = "opcoes-teste";

  let mealId: number;
  let setId: number;
  let optionId: number;
  let otherOptionId: number;
  let groupId: number;

  beforeAll(async () => {
    // Seeded here rather than borrowed from the tests above: a food is what a
    // group and an item both point at, and a fixture that depends on another
    // test having run is a fixture that fails for the wrong reason.
    await pg.exec(`
      insert into dataset_versions
        (id, dataset, edition, sha256, file_bytes, row_count, source_url, citation, retrieved_at)
      values (99, 'taco', '4a', 'opcoes', 1, 1, 'https://example.test', 'citation', '2026-08-17')
      on conflict do nothing;
      insert into food_groups (slug, name, position)
      values ('opcoes', 'Opções', 99) on conflict do nothing;
      insert into foods (id, group_slug, description, search_text, sentinels, dataset_version_id)
      values (901, 'opcoes', 'Aveia em flocos', 'aveia em flocos', '{}'::jsonb, 99),
             (902, 'opcoes', 'Pão francês', 'pao frances', '{}'::jsonb, 99)
      on conflict do nothing;

      insert into diet_presets (slug, name, description)
      values ('${SLUG}', 'Opções', 'Um café da manhã com escolhas.');
      insert into diet_preset_meals (preset_slug, position, name, share)
      values ('${SLUG}', 1, 'Café da manhã', 1.0);
    `);

    const meal = await pg.query<{ id: number }>(
      `select id from diet_preset_meals where preset_slug = '${SLUG}'`,
    );
    mealId = meal.rows[0]!.id;

    await pg.exec(`
      insert into diet_preset_option_sets (meal_id, position, name)
      values (${mealId}, 1, 'Carboidrato');
    `);
    const set = await pg.query<{ id: number }>(
      `select id from diet_preset_option_sets where meal_id = ${mealId}`,
    );
    setId = set.rows[0]!.id;

    await pg.exec(`
      insert into diet_preset_options (set_id, position, name, is_default)
      values (${setId}, 1, 'Aveia', true), (${setId}, 2, 'Pão com ovo', false);
      insert into diet_preset_groups (preset_slug, slug, name)
      values ('${SLUG}', 'frutas', 'Frutas');
    `);
    const options = await pg.query<{ id: number; position: number }>(
      `select id, position from diet_preset_options where set_id = ${setId} order by position`,
    );
    optionId = options.rows[0]!.id;
    otherOptionId = options.rows[1]!.id;

    const group = await pg.query<{ id: number }>(
      `select id from diet_preset_groups where preset_slug = '${SLUG}'`,
    );
    groupId = group.rows[0]!.id;
  }, 30_000);

  it("refuses a meal with no share of the day", async () => {
    // #113: the column is not-null with no default on purpose. A meal that
    // reaches the table without a share is a meal the app would have to invent
    // a number for — an even split over the meal count — and then present as
    // the plan's own.
    await expect(
      pg.exec(`
        insert into diet_preset_meals (preset_slug, position, name)
        values ('${SLUG}', 9, 'Ceia');
      `),
    ).rejects.toThrow(/share/i);
  });

  it("refuses a group naming a food that does not exist", async () => {
    // The argument of § D13, one table further down: a group is members by
    // `foods.id`, so it cannot name a food the server has never heard of —
    // and a custom food, which lives only in IndexedDB, is precisely that.
    // There is no id a preset could write here to reach one.
    await expect(
      pg.exec(`
        insert into diet_preset_group_foods (group_id, food_id, position)
        values (${groupId}, 9999, 1);
      `),
    ).rejects.toThrow(/foreign key/i);
  });

  it("offers each food once, in an order it chose", async () => {
    await pg.exec(`
      insert into diet_preset_group_foods (group_id, food_id, position)
      values (${groupId}, 901, 1), (${groupId}, 902, 2);
    `);

    // The same food twice in one group is a swap control with a duplicate in
    // it, not a richer group.
    await expect(
      pg.exec(`
        insert into diet_preset_group_foods (group_id, food_id, position)
        values (${groupId}, 901, 3);
      `),
    ).rejects.toThrow(/duplicate key/i);

    // And two foods at the same position is an order that does not exist.
    await expect(
      pg.exec(`
        insert into diet_preset_group_foods (group_id, food_id, position)
        values (${groupId}, 901, 2);
      `),
    ).rejects.toThrow(/duplicate key/i);
  });

  it("lets a set have exactly one default", async () => {
    // The database half of "a preset arrives with a coherent plan". At most
    // one, here; at least one is the loader's, because Postgres cannot check
    // it without a deferred key back into a row that does not exist yet.
    await expect(
      pg.exec(`
        update diet_preset_options set is_default = true where id = ${otherOptionId};
      `),
    ).rejects.toThrow(/duplicate key/i);

    const defaults = await pg.query<{ count: number }>(
      `select count(*)::int as count from diet_preset_options
        where set_id = ${setId} and is_default`,
    );
    expect(defaults.rows[0]?.count).toBe(1);
  });

  it("numbers positions per container, fixed rows included", async () => {
    // A meal's own row 1 and an option's row 1 are different rows in different
    // containers — that is what `nulls not distinct` buys, and without it the
    // constraint would apply to every option and to none of the fixed rows.
    await pg.exec(`
      insert into diet_preset_items
        (meal_id, option_id, position, food_id, quantity_g, min_g, max_g)
      values (${mealId}, null, 1, 901, 100, 50, 200),
             (${mealId}, ${optionId}, 1, 902, 60, 40, 90);
    `);

    // Two fixed rows at position 1 is the case Postgres's default NULL
    // semantics would have waved through.
    await expect(
      pg.exec(`
        insert into diet_preset_items
          (meal_id, option_id, position, food_id, quantity_g, min_g, max_g)
        values (${mealId}, null, 1, 902, 30, 10, 50);
      `),
    ).rejects.toThrow(/duplicate key/i);

    // And so is two rows at position 1 inside one option.
    await expect(
      pg.exec(`
        insert into diet_preset_items
          (meal_id, option_id, position, food_id, quantity_g, min_g, max_g)
        values (${mealId}, ${optionId}, 1, 901, 30, 10, 50);
      `),
    ).rejects.toThrow(/duplicate key/i);
  });

  it("keeps a slot pointing at a group of this preset", async () => {
    await pg.exec(`
      insert into diet_preset_items
        (meal_id, option_id, position, food_id, quantity_g, min_g, max_g, group_id)
      values (${mealId}, null, 2, 901, 100, 50, 200, ${groupId});
    `);

    await expect(
      pg.exec(`
        insert into diet_preset_items
          (meal_id, option_id, position, food_id, quantity_g, min_g, max_g, group_id)
        values (${mealId}, null, 3, 901, 100, 50, 200, 9999);
      `),
    ).rejects.toThrow(/foreign key/i);
  });

  it("takes its groups, sets, options and rows with it when it goes", async () => {
    // A preset is a template, and a retired template that leaves four tables
    // of orphans behind is a seed that grows every time it runs.
    await pg.exec(`delete from diet_presets where slug = '${SLUG}';`);

    const left = await pg.query<{ table_name: string; count: number }>(`
      select 'groups' as table_name, count(*)::int as count from diet_preset_groups
      union all select 'group_foods', count(*)::int from diet_preset_group_foods
      union all select 'sets', count(*)::int from diet_preset_option_sets
      union all select 'options', count(*)::int from diet_preset_options
      union all select 'items', count(*)::int from diet_preset_items
    `);

    for (const row of left.rows) {
      expect(row.count, `diet_preset_${row.table_name}`).toBe(0);
    }
  });
});
