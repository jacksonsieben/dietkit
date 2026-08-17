# DietKit

**A local-first PWA that turns your body data into energy targets, builds a diet from real Brazilian food-composition data, and tracks your weight so every new plan starts from your current numbers.**

> **Status: planning.** No application code yet. This repository currently holds
> the scope, architecture and decision record. See [docs/SCOPE.md](docs/SCOPE.md)
> to understand what is being built and in what order.

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

## Documentation

- [docs/SCOPE.md](docs/SCOPE.md) — goals, phases P0–P3, launch blockers, open risks
- [docs/DECISIONS.md](docs/DECISIONS.md) — decisions on record, with reasoning
- [docs/MACRO-RECONCILIATION.md](docs/MACRO-RECONCILIATION.md) — prior art from the
  predecessor app: how per-meal macro targets were reconciled, what broke, and the
  joint-solve approach that should replace it here

## Predecessor

DietKit supersedes [diet_calculator_app](https://github.com/jacksonsieben/diet_calculator_app),
a single-user Streamlit tool ([live](https://dietcalculator.streamlit.app/)). That
app's macro-reconciliation algorithm is documented here and its diets will be
importable as starting templates.

## Scope note

DietKit is a **calculator and self-tracking tool**, not a prescription tool. In
Brazil, prescribing individualised diets is restricted to registered nutritionists
(CFN). The product copy and disclaimers reflect that deliberately.

## License

MIT — see [LICENSE](LICENSE). The TACO food-composition data is **not** covered by
this license; its terms are being cleared separately (see the P0 licensing issue).
