import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Vault } from "@/lib/sync/vault";

import { eraseAccount } from "./erasure";
import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "./pglite.fixture";
import { createDatabaseTransport } from "./sync";
import { createDatabaseVaultStore } from "./vault";

/**
 * Deleting an account, checked against a real migrated database (#97).
 *
 * The claim under test is the one the privacy notice makes out loud: after a
 * deletion, nothing on this server carries that account id. The way to be
 * wrong about it is not to write a broken `DELETE` — it is to add a table
 * later and forget to name it in the statement, at which point every existing
 * assertion about `sync.rows` still passes while rows nobody can ever reach
 * accumulate somewhere else.
 *
 * So the main test does not name any table. It asks the catalog for every
 * text-ish column in every non-system schema and looks for the id in all of
 * them, the way `./boundary.test.ts` asks the catalog what tables exist rather
 * than trusting a TypeScript file. A new table with an `account_id` fails here
 * on the day it is migrated.
 *
 * The sweep proves it can find something, too: a second account is seeded and
 * left alone, and the same sweep is expected to keep finding *its* id. A search
 * that quietly matched nothing would otherwise pass this file forever.
 */

let fixture: ReferenceDatabase;

beforeAll(async () => {
  fixture = await createReferenceDatabase();
}, 60_000);

afterAll(async () => {
  await fixture?.pg.close();
});

const NOTICE = "2026-08-18";

const VAULT: Vault = {
  version: 1,
  kdf: "PBKDF2-SHA256",
  iterations: 600_000,
  salt: "c2FsdC1vbmU",
  passphrase: { nonce: "cGFzcy1u", ciphertext: "cGFzcy1j" },
  recovery: { nonce: "cmVjLW4", ciphertext: "cmVjLWM" },
};

/** An account with sync turned on and a few sealed records behind it. */
async function seed(accountId: string): Promise<void> {
  await createDatabaseVaultStore(fixture.db, accountId).write(
    { ...VAULT, salt: `salt-${accountId}` },
    NOTICE,
  );

  await createDatabaseTransport(fixture.db, accountId).push([
    {
      collection: "weight",
      recordId: randomUUID(),
      ciphertext: "c2VhbGVk",
      nonce: "bm9uY2U",
      baseRev: 0,
      deleted: false,
    },
    {
      collection: "settings",
      recordId: "singleton",
      ciphertext: "c2VhbGVkLXR3bw",
      nonce: "bm9uY2UtdHdv",
      baseRev: 0,
      deleted: false,
    },
  ]);
}

/**
 * Every place in this database where a string is stored, searched for one.
 *
 * `uuid` is cast rather than skipped: an account id is a uuid string, and a
 * column that stored it as one would be just as much a record of the person.
 */
async function occurrences(value: string): Promise<string[]> {
  const { rows: columns } = await fixture.pg.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
  }>(
    `select c.table_schema, c.table_name, c.column_name
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema
        and t.table_name = c.table_name
        and t.table_type = 'BASE TABLE'
      where c.table_schema not in
            ('pg_catalog', 'information_schema', 'pg_toast')
        and c.data_type in ('text', 'character varying', 'uuid')
      order by 1, 2, 3`,
  );

  const found: string[] = [];

  for (const column of columns) {
    const where = `"${column.table_schema}"."${column.table_name}"`;
    const { rows } = await fixture.pg.query<{ count: number | string }>(
      `select count(*) as count from ${where}
        where "${column.column_name}"::text = $1`,
      [value],
    );

    if (Number(rows[0]?.count ?? 0) > 0) {
      found.push(`${where}."${column.column_name}"`);
    }
  }

  return found;
}

describe("eraseAccount", () => {
  it("leaves nothing anywhere that carries the account id", async () => {
    const gone = randomUUID();
    const kept = randomUUID();
    await seed(gone);
    await seed(kept);

    // The sweep has to be able to find an account before its silence about a
    // deleted one means anything.
    expect(await occurrences(gone)).not.toEqual([]);

    await eraseAccount(fixture.db, gone);

    expect(await occurrences(gone)).toEqual([]);
    expect(await occurrences(kept)).not.toEqual([]);
  });

  it("reports what it deleted", async () => {
    const accountId = randomUUID();
    await seed(accountId);

    expect(await eraseAccount(fixture.db, accountId)).toEqual({
      rows: 2,
      vaults: 1,
      consents: 1,
    });
  });

  it("deletes the consent record rather than stamping it", async () => {
    // The difference from `createDatabaseVaultStore(...).erase()`, which keeps
    // that row on purpose: withdrawing consent has to stay provable (GDPR art.
    // 7(3)), but there is nobody left for it to be evidence about once the
    // account itself is gone.
    const accountId = randomUUID();
    await seed(accountId);
    await createDatabaseVaultStore(fixture.db, accountId).erase();

    const { rows: revoked } = await fixture.pg.query<{
      count: number | string;
    }>(
      `select count(*) as count from sync.consent
        where account_id = $1 and revoked_at is not null`,
      [accountId],
    );
    expect(Number(revoked[0]?.count)).toBe(1);

    expect(await eraseAccount(fixture.db, accountId)).toMatchObject({
      consents: 1,
    });
    expect(await occurrences(accountId)).toEqual([]);
  });

  it("is safe for an account that never turned sync on", async () => {
    // The delete screen cannot know whether sync was ever enabled without
    // asking a question it has no business asking, so it always calls this.
    expect(await eraseAccount(fixture.db, randomUUID())).toEqual({
      rows: 0,
      vaults: 0,
      consents: 0,
    });
  });
});
