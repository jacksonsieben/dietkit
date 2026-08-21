# DietKit

**A local-first PWA that turns your body data into energy targets, builds a diet from real Brazilian food-composition data, and tracks your weight so every new plan starts from your current numbers.**

> **Status: P0 — foundation.** The app skeleton is up; features are not built yet.
> See [docs/SCOPE.md](docs/SCOPE.md) for what is being built and in what order.

## The idea in one paragraph

Most diet apps ask you to hand over your weight history, and weight history is
health data — the most tightly regulated category there is under both LGPD and
GDPR. DietKit sidesteps that instead of complying with it: the server never sees
your personal data at all. Neon holds only reference data (the TACO food table,
exercise catalog, presets). Your profile, weight log and diets live in IndexedDB
on your own device, with a user-held JSON export as the backup.

## Why "local-first" is a product decision, not just an architectural one

| Layer | Holds | Personal data? |
|---|---|---|
| Neon Postgres | TACO food composition, exercise catalog, presets | None |
| Next.js server | Food search, preset delivery — stateless, read-only | None |
| IndexedDB | Profile, weight log, diets, custom foods, settings | All of it — on device |
| JSON export | Full backup, user-initiated | The user's own file |

The upside: no accounts, no consent flows, no data-subject-request tooling, no
breach process, and hosting cost that does not scale with user count.

The cost: **data loss becomes a support problem.** Clearing site data or
switching phones destroys months of logs. This is the single biggest risk in the
plan, and it is why backup/restore is a launch blocker rather than a nicety.

There is also **no analytics** — not "cookieless analytics", none. The vendors
that market themselves as cookieless still identify visitors by hashing IP and
user agent, which under the LGPD is still personal data; dropping the cookie
removes the consent banner, not the obligation. The ban is enforced by ESLint
and by `src/no-analytics.test.ts`, which fails the build on an inline tag or on
the dependency turning up in `package.json`. See
[DECISIONS.md § D9](docs/DECISIONS.md).

## Planned stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Reference DB | Neon Postgres |
| Query layer | Drizzle |
| On-device store | Dexie (IndexedDB), behind a repository interface |
| Service worker | Serwist |
| Charts | Recharts |
| i18n | pt-BR only at launch, library wired from day one |
| Hosting | Vercel |

## Running locally

Requires Node 20.19+ (Vercel builds on Node 24).

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build, then `serwist build` for the service worker |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Vitest, single run |
| `npm run taco:extract` | Re-extract `data/taco-4ed.json` from the TACO PDF |
| `npm run db:seed` | Load `data/taco-4ed.json` into the reference database |
| `npm run db:seed:exercises` | Load `src/lib/training/catalog.ts` into the reference database |

### Strings

Every user-facing string lives in `messages/pt-BR.json` — none in components.
Two things enforce that rather than trusting discipline:

- `react/jsx-no-literals` fails the lint on any literal text in JSX.
- `AppConfig["Messages"]` is typed from the catalogue, so `t("Home.hedaing")`
  fails `tsc`.

pt-BR is the only shipped locale and serves from unprefixed URLs. Adding one
means an entry in `src/i18n/routing.ts` and a file in `messages/` — nothing else.

`GET /api/health` is the deploy health check — it reports the running commit and
environment, and is deliberately uncached so a green response proves the deployed
function actually ran.

### Storage

Everything personal lives in IndexedDB behind `src/lib/storage`. Components call
`getRepository()` and never see Dexie:

```ts
const repo = getRepository();
const latest = await repo.weight.latest();
```

Two adapters implement the same `Repository` interface — Dexie/IndexedDB for the
app, in-memory for tests — and a single contract suite runs against both, so
"swappable" is checked rather than asserted. The Dexie adapter is exercised
through `fake-indexeddb`, meaning the tests hit real transactions and real
unique indexes.

`no-restricted-imports` fails the lint on any `dexie` import outside
`src/lib/storage/dexie/`, which is what keeps opt-in sync reachable later
without a rewrite. `getRepository()` throws on the server rather than returning
an empty store — a server-side read of personal data is a bug, not a fallback.

### Offline and the service worker

`src/sw.ts` is compiled to `public/sw.js` by `serwist build`, run as a second
step after `next build` rather than through Serwist's webpack plugin — Next 16
builds with Turbopack, where that plugin silently produces no worker at all.
`public/sw.js` is build output and is git-ignored.

Offline is not decoration here: the data is already on the device, so an app
that goes blank without a network is hiding data the user is standing on top of.
`/` and `/~offline` are precached by commit SHA; any other navigation that fails
falls back to `/~offline`, which explains that only food search needs a
connection. Only the TACO table lives on the server. See
[DECISIONS.md § D15](docs/DECISIONS.md).

### Reference database

The other side of that boundary. Neon Postgres holds ten tables — food
composition, food groups, the exercise catalogue, diet and training presets, and
one provenance row per ingested dataset — reached through Drizzle in
`src/lib/db`:

```ts
const rows = await db().select().from(foods).where(eq(foods.groupSlug, slug));
```

**No table in it describes a person**, and that is a test rather than a promise.
`boundary.test.ts` applies the checked-in migrations to a real Postgres — PGlite,
Postgres compiled to WebAssembly — and then asks `information_schema` what
exists: the table names must equal an exact allowlist, and no column name may
contain a segment like `weight`, `email` or `profile`. It needs no credentials,
so it runs in `npm test` on every change.

Published values are stored as `numeric`, because § D12 treats them as
quotations and `70.1` has to come back as `70.1`. TACO prints three kinds of
non-value — `NA` (*não aplicável*), `Tr` (*traço*) and `*` (a figure NEPA
withdrew pending re-analysis) — plus genuinely blank cells, so a nullable column
carries the number and a sparse `sentinels` map carries the reason it is missing.
`readCell` keeps all four apart for display; `numericValue` is the only place
they become 0.

Migrations are checked in as SQL under `drizzle/` and reviewed in the diff:

```bash
npm run db:generate   # after editing src/lib/db/schema
npm run db:migrate    # apply, using DATABASE_URL_UNPOOLED
```

Copy `.env.example` to `.env` for the two connection strings — pooled for the
app's reads, direct for DDL — and note which is which; the app also runs fine
against a read-only Neon role, since it never writes.

### Food data

The 597 foods come from TACO's PDF, and the extraction is a separate step from
the seed:

```bash
npm run taco:extract -- ~/Downloads/taco_4_edicao_ampliada_e_revisada.pdf
npm run db:seed
```

`taco:extract` runs once per edition of the source and writes
`data/taco-4ed.json`, which is checked in — so seeding, testing and CI never
touch the PDF, and any change to a published number arrives as a reviewable
diff. It refuses to read a file whose SHA-256 is not the pinned one: a different
printing under the same title is a different set of numbers, and ingesting it
would make the citation false.

The numbers are lifted by geometry, not by counting cells. Half the printed rows
have gaps, so "the fourth number is the fourth column" would file thiamine as a
retinol equivalent; `scripts/taco/parse.ts` assigns complete rows in order and
gapped rows by column position, and aborts if a page's headers stop matching the
nutrient list. `scripts/taco/parse.test.ts` runs it against captured pages of the
real publication, and `dataset.test.ts` re-checks the shipped file — down to
kJ ≈ kcal × 4,184, which would catch a slipped column anywhere in the table.

`db:seed` is idempotent: every write is an upsert keyed on TACO's own food
number, so running it twice leaves what running it once did, and re-extracting
updates rows in place instead of renumbering them. It needs the direct
(non-pooler) connection — it is one transaction — and refuses a `-pooler` URL
rather than half-writing the table.

### Exercise data

The 117 movements in `src/lib/training/catalog.ts` are written by this project —
there is no TACO for exercises, and no Brazilian dataset published under terms we
could take. The file ships two ways:

```bash
npm run db:seed:exercises
```

The screens read the bundled array. This catalog is read in a gym, which is
frequently a basement with concrete walls, and a screen that has to reach the
network to name the next exercise is a screen that fails precisely where it is
used. The seed exists because `training_preset_items.exercise_slug` is a foreign
key to `exercises.slug`, so the shared presets need something to point at.

It is idempotent the same way `db:seed` is, keyed on the slug, and it writes a
`dataset_versions` row naming us as the author and pinning the SHA-256 of the
catalog file. See docs/DECISIONS.md § D16.

### Solver

`src/lib/solver` balances protein, carbs and fat at once instead of one macro at
a time:

```ts
const solution = solveMacros(foods, { proteinG: 45, carbG: 75, fatG: 20 });
```

It is a bounded least-squares fit — quantities stay inside each food's portion
bounds — with no dependency, because at a few dozen variables there is nothing a
linear-algebra library would win. A meal is underdetermined (three macros, many
foods), so the fit is anchored at the plan's current quantities: that makes the
answer unique, continuous in the inputs, and the one closest to what the user
already wrote. Unreachable targets come back as a signed per-macro `residual`
plus the `limiting` foods stuck at a bound, never as a quietly wrong plan.

15 foods solve in about 0.1 ms, so the builder can solve on every keystroke.
Full findings, including the two algorithms that were tried and rejected:
[docs/SPIKE-MACRO-SOLVER.md](docs/SPIKE-MACRO-SOLVER.md).

## Documentation

- [docs/SCOPE.md](docs/SCOPE.md) — goals, phases P0–P3, launch blockers, open risks
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisions on record, with reasoning
- [docs/MACRO-RECONCILIATION.md](docs/MACRO-RECONCILIATION.md) — prior art from the
  predecessor app: how per-meal macro targets were reconciled, what broke, and the
  joint-solve approach that should replace it here
- [docs/SPIKE-MACRO-SOLVER.md](docs/SPIKE-MACRO-SOLVER.md) — the joint solver spike:
  measurements, the algorithms that did not work, and what it means for the builder
- [docs/TACO-LICENSING.md](docs/TACO-LICENSING.md) — TACO's terms, the provenance of
  the file we ingest, the required attribution, and why TBCA was rejected

## Predecessor

DietKit supersedes [diet_calculator_app](https://github.com/jacksonsieben/diet_calculator_app),
a single-user Streamlit tool ([live](https://dietcalculator.streamlit.app/)). That
app's macro-reconciliation algorithm is documented here and its diets will be
importable as starting templates.

## Scope note

DietKit is a **calculator and self-tracking tool**, not a prescription tool. In
Brazil, prescribing individualised diets is restricted to registered nutritionists
(CFN). The product copy and disclaimers reflect that deliberately.

## Data source

Food composition values come from the **TACO** table, published by NEPA/UNICAMP:

> NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA). Tabela brasileira de
> composição de alimentos — TACO. 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP,
> 2011. Disponível em: https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/

NEPA permits reproduction in whole or in part *"desde que seja citada a fonte"* —
provided the source is cited. So the credit is not decoration: it is the licence
condition, it appears in the footer of every page and in full at `/fontes`, and
the citation is defined once in `src/lib/attribution.ts` with a test that fails if
it drifts from the wording agreed in the docs.

DietKit copies the published values and never recalculates them — `NA`, `Tr` and
the withdrawn `*` included. NEPA and UNICAMP published the table; they did not
review, approve or endorse this app.

Full terms, provenance (including the pinned file hash), why TBCA was rejected,
and the rules we hold ourselves to:
[docs/TACO-LICENSING.md](docs/TACO-LICENSING.md).

## License

MIT — see [LICENSE](LICENSE). The TACO food-composition data is **not** covered by
that license: it is © 2011 NEPA/UNICAMP, reproduced under the permission quoted
above, and citing the source is required whether or not you took the code.
