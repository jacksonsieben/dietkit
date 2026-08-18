import type { PGlite } from "@electric-sql/pglite";
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { beforeAll, describe, expect, it } from "vitest";

import { createReferenceDatabase, migrationFiles } from "./pglite.fixture";
import * as schema from "./schema";

/**
 * The reference database, migrated for real and then inspected.
 *
 * PGlite is Postgres compiled to WebAssembly, so this applies the checked-in
 * DDL exactly as Neon will and asks the resulting catalog what exists. That
 * matters for the claim this file exists to defend: "no personal-data table"
 * has to be true of the database, not of a TypeScript file that may or may not
 * have been migrated.
 */

interface TableColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

let pg: PGlite;
let columns: TableColumn[];
let tableNames: string[];

beforeAll(async () => {
  // Applying them in order is the same thing `db:migrate` does.
  expect(migrationFiles().length).toBeGreaterThan(0);
  ({ pg } = await createReferenceDatabase());

  const result = await pg.query<TableColumn>(
    `select table_name, column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position`,
  );
  columns = result.rows;
  tableNames = [...new Set(columns.map((column) => column.table_name))].sort();
}, 60_000);

/**
 * Every table the reference database is allowed to have.
 *
 * An allowlist, not a denylist, because a denylist can be walked around by
 * naming a table `w_log` and a person's weight is still a person's weight. To
 * add a table here you have to look at this comment first — which is the whole
 * mechanism. Personal data belongs in IndexedDB behind `src/lib/storage`
 * (docs/DECISIONS.md § D1).
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
 * Words that have no business in a reference database. Matched against
 * `snake_case` segments, so `age` does not fire on `storage` and `sets` does not
 * fire on `session` — the check is meant to be precise enough to be left on.
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

function segments(identifier: string): string[] {
  return identifier.split("_");
}

function personalSegments(identifier: string): string[] {
  return segments(identifier).filter((segment) =>
    PERSONAL_SEGMENTS.has(segment),
  );
}

describe("reference database schema", () => {
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

    const fromDatabase = columns
      .map((column) => `${column.table_name}.${column.column_name}`)
      .sort();

    expect(fromDatabase).toEqual(fromCode);
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
