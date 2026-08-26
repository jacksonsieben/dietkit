/**
 * Every table this project's migrations create.
 *
 * **`public` holds no personal data.** Not "should not" — the reference tables
 * below are the whole of it, and `src/lib/db/boundary.test.ts` asserts that the
 * migrated database contains exactly those tables and no column that looks like
 * it belongs to a person. Adding one means editing that allowlist, which is the
 * point: the boundary in docs/DECISIONS.md § D1 should be impossible to cross by
 * accident.
 *
 * `sync` is the one exception, and it is the exception that proves the rule: its
 * rows belong to people and the server cannot read a single one of them (#95).
 * It gets the opposite guard — a column allowlist written out table by table —
 * for the same reason, and a table with no allowlist fails rather than passing
 * unexamined.
 *
 * Profile, weight log, diets, custom foods, training and settings live in
 * IndexedDB behind `src/lib/storage`. They leave the device only sealed, and
 * only if somebody turns sync on.
 */
export * from "./exercises.ts";
export * from "./foods.ts";
export * from "./presets.ts";
export * from "./provenance.ts";
export * from "./sync.ts";
