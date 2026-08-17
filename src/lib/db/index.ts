/**
 * The reference database: TACO food composition, the exercise catalog, and diet
 * and training presets. Read-only from the app's side, and free of personal data
 * by construction — see `./schema` and docs/DECISIONS.md § D1.
 *
 * `db()` is server-only. The schema and nutrient helpers are not, so a client
 * component can hold a `Food` type or format a `Tr` cell without dragging a
 * database driver into the bundle.
 */
export * from "./nutrients";
export * from "./schema";
