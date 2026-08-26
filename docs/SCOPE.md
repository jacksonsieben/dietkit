# DietKit — v1 Scope

A local-first PWA that turns your body data into energy targets, builds a diet
from real Brazilian food-composition data, and tracks your weight so every new
plan starts from your current numbers.

---

## 1. The architecture in one page

Weight, body metrics and training loads are health data — *dado pessoal sensível*
under LGPD Art. 5 II, special-category under GDPR Art. 9. That is the strictest
tier there is, stricter than a name or an email address.

The design sidesteps it rather than complying with it: **the server never sees any
of it.**

| Layer | Holds | Personal data? |
|---|---|---|
| Neon Postgres | TACO food composition, exercise catalog, diet & training presets | None |
| Next.js server | Food search, preset delivery. Stateless, read-only. | None |
| IndexedDB | Profile, weight log, diets, custom foods, settings | All of it — on device |
| JSON export | Full backup, user-initiated, user-held | User's own file |

With no accounts and no server-side personal data, controller obligations collapse
to an honest privacy notice: no consent flows, no data-subject-request tooling, no
breach process, and hosting cost that does not scale with user count.

### The cost of that choice

Local-first plus a public launch makes data loss a support problem. With friends
you can say "export next time." With strangers, clearing site data or switching
phones destroys months of logs, and they will reasonably blame the app.

This is the single biggest risk in the plan. It is why backup and restore is a
**launch blocker** rather than a nicety, and why opt-in sync may need to be pulled
forward to v1.5 rather than sitting in v2.

---

## 2. Phases

### P0 — Foundation & launch prerequisites *(blocks everything)*

- Next.js App Router + TypeScript + Tailwind; Neon + Drizzle for reference data.
- TACO ingest pipeline — source, normalise, seed, attribute. **Licensing cleared
  before anything public.**
- Storage abstraction. A `Repository` interface with an IndexedDB adapter. No
  component touches IndexedDB directly — this is what keeps sync reachable later.
- **Solver spike** — prove the joint macro solve converges and is fast enough
  before committing to the diet builder. De-risks P2.
- i18n library wired from day one. pt-BR is the only shipped locale, but strings
  are externalised from the first component; retrofitting i18n is expensive,
  stubbing it is cheap.
- PWA shell: manifest, service worker, offline route, install prompt.
- Privacy notice, terms, health disclaimer. Cookieless analytics only.

### P1 — Profile & energy targets

- Body metrics: weight, height, age, sex, activity level. **Metric units only.**
- Mifflin-St Jeor — **+5 for men, −161 for women**. Get the constant right this time.
- Activity factor shown in the picker *and* under the result, with a custom
  override (1.0–2.5). Different calculators use different ladders and the same
  "moderate" can differ by 300+ kcal; make the number visible rather than arguing
  about whose scale is correct.
- Deficit/surplus adjustment, then macro coefficients in g/kg to daily gram targets.

### P2 — Diet builder *(highest complexity)*

- TACO search — server route, indexed, debounced, accent-insensitive.
- **Custom foods are mandatory, not optional.** TACO has no branded or packaged
  products; whey protein is not in it. Without a user-defined food escape hatch the
  builder cannot express real diets.
- User-defined meal count. Do not hardcode four.
- **Joint three-macro solve** over food quantities with per-food bounds. Solve
  protein, carbs and fat simultaneously instead of one at a time — this subsumes
  the fat-vehicle special case entirely. See
  [MACRO-RECONCILIATION.md](MACRO-RECONCILIATION.md).
- Mandatory items credited against the meal target before scaling.
- Substitution groups — the fruit-swap concept, generalised to any food class.
- Reconciliation panel: target versus actual, per macro, always visible.
- Predecessor Streamlit diet importable as a starting template.

### P3 — Weight log & the feedback loop

- Dated weight entries, editable, backfillable.
- Trend chart with a 7-day moving average — daily weight is mostly water noise and
  showing raw points invites bad decisions.
- **"Use my latest weight"** when starting a new diet. This is the loop that makes
  the app worth returning to.
- Full JSON export and restore, plus the backup prompts the local-first tradeoff
  demands.

### V2 — Explicitly not in v1 *(documented, not built)*

- Training: schedule builder, presets, set/rep/load logging, progression charts.
- Opt-in encrypted sync and cross-device continuity — candidate for pulling forward.
- Sharing a plan with a nutritionist or coach.
- Shared/community pool for custom foods.
- Nutrition facts from a barcode — researched and costed in
  [SPIKE-BARCODE-LOOKUP.md](SPIKE-BARCODE-LOOKUP.md); the verdict is an imported
  Open Food Facts subset served from our own route, with no WASM scanner.

---

## 3. Launch blockers

Choosing a public launch converted five items from "later" into "cannot ship without."

| Blocker | Why it is one |
|---|---|
| TACO licensing & attribution | Redistributing the table inside a public product is a different act from reading the PDF. Terms need reading and attribution needs settling **before** launch. |
| Privacy notice & terms | Required even when you collect nothing — and the notice is a genuine selling point here, not a formality. |
| Health disclaimer & positioning | In Brazil, prescribing individualised diets is restricted to nutritionists (CFN). A calculator people self-manage with is a different thing from a prescription tool, and the copy has to reflect that. |
| Cookieless analytics only | A conventional analytics tag would break the "we collect nothing" claim and re-create the LGPD obligations the architecture exists to avoid. |
| Backup & restore a stranger can succeed at | The direct consequence of local-first plus public. |
| Privacy paperwork, once sync exists | Encrypted or not, the service now holds personal data, and health data is what art. 30(5) of the GDPR takes the small-organisation exemption away for. The record of processing, the impact assessment and the incident procedure are [docs/PRIVACY-OPERATIONS.md](PRIVACY-OPERATIONS.md); the Brazilian lawyer review is the gate before telling anyone else the app exists. |

---

## 4. Open risks

**iOS storage durability — verify early.** WebKit caps script-writable storage for
sites without recent interaction, and behaviour differs between a browser tab and
an installed home-screen PWA. For a local-first tracker on iPhone this is
existential. Verify current behaviour on real hardware in Phase 0 — do not take a
blog post's word for it, including this document's.

**Solver convergence and performance — spike in P0.** The joint macro solve is the
one genuinely novel piece of engineering. Bounded least-squares over a handful of
food quantities should be tractable, but "should be" is why it gets a spike before
the diet builder is committed to.

**TACO coverage gaps.** Roughly 600 whole Brazilian foods, no branded products.
Every user will hit this within a day. Mitigated by custom foods in Phase 2 — the
risk is scoping that as a nice-to-have and shipping a builder people cannot use.

**Sync pressure arriving sooner than planned.** Public users will ask for
cross-device access almost immediately. The repository abstraction is what buys the
option; the risk is spending Phase 0 goodwill on the abstraction and then never
funding the sync it enables.

---

## 5. Proposed stack

| Concern | Choice | Reasoning |
|---|---|---|
| Framework | Next.js (App Router) | Server routes cover food search cleanly. |
| Reference DB | Neon Postgres | Free tier is ample for read-mostly reference data. |
| Query layer | Drizzle | Lighter than Prisma on serverless cold starts, strong TS inference. |
| On-device store | Dexie | Sane IndexedDB wrapper; sits behind the repository interface either way. |
| Service worker | Serwist | Actively maintained, App Router aware. |
| Charts | Recharts | Sufficient for weight trend and later progression. |
| Hosting | Vercel | Adjacent to Neon, zero-config PWA delivery. |
