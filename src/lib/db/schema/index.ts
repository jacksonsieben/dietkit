/**
 * Every table in the reference database.
 *
 * **This database holds no personal data.** Not "should not" — the list below is
 * the whole schema, and `src/lib/db/boundary.test.ts` asserts that the migrated
 * database contains exactly these tables and no column that looks like it
 * belongs to a person. Adding a table means editing that allowlist, which is the
 * point: the boundary in docs/DECISIONS.md § D1 should be impossible to cross by
 * accident.
 *
 * Profile, weight log, diets, custom foods and settings live in IndexedDB behind
 * `src/lib/storage` and never leave the device.
 */
export * from "./exercises";
export * from "./foods";
export * from "./presets";
export * from "./provenance";
