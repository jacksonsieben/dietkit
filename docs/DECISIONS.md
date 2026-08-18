# Decisions on record

Decisions that are settled. Each one has a reason attached, so a future
reader (or a future you) can tell the difference between a considered choice
and an accident.

---

### D1 — Personal data is local-first, sync-ready

Neon holds only reference data. Profile, weight history and diets live in
IndexedDB on the device. Storage sits behind a repository interface so opt-in
sync can land later without a rewrite.

**Why:** weight and body metrics are health data — the strictest tier under
LGPD Art. 5 II and GDPR Art. 9. Never receiving them is cheaper and safer than
protecting them, and it keeps hosting cost flat as users grow.

**Consequence:** data loss is a support problem. Backup/restore is a launch
blocker, not a nicety.

---

### D2 — v1 is profile + TDEE + diet + weight log

Phases P0 through P3. A complete loop: calculate, build, track, rebuild from
current weight.

**Why:** that loop is the smallest thing that is worth returning to. Training
without it is a logging app with no feedback.

**Deferred:** training (schedule, presets, load logging, progression) is v2.

---

### D3 — Public from day one

Anyone can find and use it.

**Consequence:** onboarding, legal notices and backup UX have to work for people
you will never meet. This is what promoted the five launch blockers in
[SCOPE.md](SCOPE.md#3-launch-blockers) from "later" to "cannot ship without."

---

### D4 — Name: DietKit

**Why:** both halves are ordinary words in Portuguese *and* English, so a
Brazilian reads it correctly on first sight with no explanation — which is the
test the alternatives failed. "Kit" is also honest about the shape of the
product: a set of tools, not a single-purpose tracker.

Namespace was clear across npm, `.app`, `.fit`, `.com.br`, and the GitHub org at
the time of the decision.

---

### D5 — pt-BR only, i18n wired from day one

The only shipped locale is pt-BR. The i18n library goes in with the first
component anyway and all strings are externalised.

**Why:** TACO is Brazilian and the LGPD framing is Brazilian, so pt-BR is the
right launch locale. But retrofitting i18n across a finished app is expensive
and stubbing it now is nearly free.

---

### D6 — Custom foods are per-user for now

Each user's custom foods are local to their device, like all their other data.

**Why:** it follows from D1 at zero extra cost. A shared pool is more useful, but
it quietly reintroduces user-generated content that would then need moderation —
a different product with different obligations.

**Revisit:** tracked as a dedicated issue for a later release.

---

### D7 — Metric units only

kg, cm, g, ml, kcal. No imperial support.

**Why:** the audience is Brazilian and TACO is metric. Dual units affect every
input, chart axis and stored value; the cost is not worth it before there is
demand.

---

### D8 — Neon + Vercel

Neon Postgres for reference data, Vercel for the Next.js app.

**Why:** free tiers cover read-mostly reference data and a PWA comfortably, and
the two are adjacent operationally.

---

### D9 — No analytics at all, cookieless included

No analytics tag, ever — and on inspection "cookieless" turned out not to be a
usable exception either. DietKit ships zero measurement of the people using it.

**Why:** it would break the "we collect nothing" claim and re-create precisely
the LGPD obligations the architecture exists to avoid. The privacy posture is a
feature, and it is only credible if it has no exceptions.

**Why not a cookieless vendor:** the cookie was never the thing that mattered.
Plausible, Umami and Vercel Web Analytics all derive a visitor identifier by
hashing IP address with user agent, which is pseudonymisation, not anonymisation
— under the LGPD a pseudonymous identifier is still a *dado pessoal*, and
processing it needs a legal basis, a retention answer, and a line in the notice.
Dropping the cookie removes the consent banner, not the obligation. Since the
one thing DietKit can say that no competitor can is "this never leaves your
device", spending that sentence on page-view counts is a bad trade.

**Consequence, on what is known instead:** nothing, by design. Vercel's own
request logs exist at the infrastructure layer whatever we do — they are the
platform's operational records, not a product decision, and the privacy notice
(#10) names them plainly rather than pretending the origin is blind. Product
questions get answered by talking to users, not by watching them.

**Consequence, on enforcement:** this is checked, not just written down. ESLint
`no-restricted-imports` blocks the packages, and because ESLint replaces a
rule's options rather than merging them, the analytics patterns are restated in
the block that exempts the storage and db adapters from the *other* boundaries.
`src/no-analytics.test.ts` covers what a linter cannot see: an inline `<script>`
pasted from a vendor's setup page, and the dependency appearing in
`package.json` at all — devDependencies included, because a tag added "just for
staging" is still a tag.

**Consequence, operationally:** Web Analytics and Speed Insights must stay
switched off in the Vercel project settings. Both are dashboard toggles that
inject `/_vercel/insights/script.js` server-side; no commit would show it, and
neither check above would fire.

---

### D10 — Positioned as a calculator, not a prescription tool

Product copy and disclaimers state plainly that DietKit computes and the user
decides.

**Why:** in Brazil, prescribing individualised diets is restricted to registered
nutritionists (CFN). Positioning is not cosmetic here.

---

### D11 — Macros are solved jointly, anchored at the current plan

One bounded least-squares solve over all three macros at once, regularised
toward the quantities the plan already holds. Hand-written, no dependency. See
[SPIKE-MACRO-SOLVER.md](SPIKE-MACRO-SOLVER.md) for the measurements.

**Why:** solving one macro at a time is what left the predecessor's protein
14 g over target while fat landed exact — cross-macro carry-over cannot be
credited by a scaler that only looks at its own macro. The anchor exists because
a meal is underdetermined (three equations, 5–15 foods): without it the solver
returns an arbitrary member of the solution family, and portions jump around as
the user types.

**Consequence:** the fat vehicle is not a concept in the data model, only a food
whose composition happens to be (0, 0, 1). `quantityG` on a food is load-bearing
input, not display state. An unreachable target is a normal UI state that shows
a per-macro residual and names the foods stuck at a bound.

---

### D12 — Food data is TACO 4th edition, cited on every screen

TACO (NEPA/UNICAMP, 2011), reproduced under the permission printed in the
publication: *"É permitida a reprodução total ou parcial do material, desde que
seja citada a fonte."* Full analysis in
[TACO-LICENSING.md](TACO-LICENSING.md).

**Why:** it is the only Brazilian food composition table whose own terms permit
redistribution inside a public product. The obvious alternative, TBCA
(USP/FoRC), is CC BY-NC-ND — no derivatives, non-commercial — which a database
copy cannot satisfy. The trade is 2011 data in exchange for the right to ship
it; laboratory measurements of Brazilian foods do not go stale the way software
does.

**Consequence:** attribution is a licence condition, not a courtesy. It sits in
the layout footer so it covers screens nobody has written yet, and the citation
has one definition (`src/lib/attribution.ts`) with a test tying it to the docs.
The ingest copies published values verbatim — no unit conversion, no recomputed
energy, `NA` and `Tr` preserved — because NEPA granted reproduction and said
nothing about adaptation.

---

### D13 — The server database holds reference data and is checked, not trusted

Neon holds ten tables: food composition, food groups, the exercise catalogue,
diet and training presets, and one provenance table. No table describes a
person. That is enforced by `src/lib/db/boundary.test.ts`, which applies the
checked-in migrations to a real Postgres (PGlite, Postgres compiled to WASM) and
then interrogates `information_schema` — an exact allowlist of table names plus a
per-segment denylist of words like `weight`, `email` and `profile` that also
catches an `owner_email` growing inside an allowed table.

**Why:** § D1 makes "the server never receives personal data" a product promise,
and a promise held only by intention is held until the first convenient
exception. The check runs in `npm test` with no database credentials, so it is
cheap enough to leave on forever. Both halves have been shown to fail on purpose:
adding a `weight_kg` column trips the schema-drift test before it is migrated and
the column denylist after.

**Consequence:** published values are stored as `numeric`, not `double
precision`, because § D12 calls them quotations — `70.1` must come back as `70.1`.
The table's four cell states are kept apart by a nullable numeric column plus one
sparse `sentinels` JSONB map, so `NA` (*não aplicável*), `Tr` (*traço*), `*`
(withdrawn, § D14) and a blank cell stay distinguishable from a measured zero;
`readCell` preserves them for display and `numericValue` is the single place they
collapse to 0 for arithmetic.
Presets are relational rather than one JSONB blob so that a preset referencing a
food that does not exist fails at seed time, and referencing somebody's custom
food is structurally impossible. There is deliberately no column for a load in
kilograms anywhere in this database.

---

### D14 — TACO is extracted from the PDF once per edition, and the result is checked in

`scripts/taco/extract.ts` reads the publication and writes `data/taco-4ed.json`;
`scripts/taco/seed.ts` loads that file into Neon. Nothing in the app, the tests
or CI ever opens the PDF.

**Why:** NEPA publishes the 4th edition as a typeset PDF and nothing else — no
CSV, no API. Parsing it at seed time would make the numbers we ship depend on a
PDF library version, on a file downloaded at some unrecorded moment, and on a
run nobody reviewed. Extracting once puts the 597 rows in the diff, where a
change to a published value has to be read by a human before it reaches a
database that carries NEPA's citation. The PDF is pinned by SHA-256
(`TACO_SOURCE.sha256`), so a different printing under the same title stops the
extract rather than silently replacing the table the attribution names.

**Consequence, on reading the table:** the parser assigns a number to a nutrient
by geometry, never by counting. Half the printed rows have gaps — 509 of 1194 —
so "the fourth number is the fourth column" would file thiamine as a retinol
equivalent. A row that prints every cell is assigned in order (which absorbs the
misprints where a cell sits ~25pt off its column); a row with gaps is assigned by
nearest column centre, strictly increasing. A page whose headers do not match
`NUTRIENTS` unit for unit aborts the extract.

**Consequence, on what the table can say:** `*` is a fourth cell state, not a
variant of `Tr`. NEPA prints it where a figure was withdrawn pending re-analysis
— 21 foods carry it, including "Leite, de vaca, integral", whose macros are all
`*`. It is stored like the other sentinels (NULL plus a mark) and must never be
read as a small number.

**Consequence, on trusting the extraction:** the 1194 half-rows were re-read
independently with poppler's `pdftotext -layout` and compared cell by cell, and
`scripts/taco/dataset.test.ts` re-checks the shipped file on every `npm test` —
including a kJ ≈ kcal × 4,184 identity that would catch a column slip anywhere in
the table without knowing anything about the layout.

**Consequence, on seeding:** every write is an upsert keyed on what the
publication itself calls the row (`foods.id` is TACO's food number, which clients
already store as `FoodRef.tacoId`), so re-seeding updates in place and a food
keeps its identity across editions. A blank cell is written as an explicit NULL
so a re-extraction can clear one. The ingest is one transaction and therefore
uses the direct Neon host, not the pooler; `db:seed` refuses a `-pooler` URL
rather than half-writing the table.

---

### D15 — The service worker is built after Next, not by it

`serwist build serwist.config.mjs` compiles `src/sw.ts` into `public/sw.js` as a
second step in `npm run build`, rather than through the `withSerwist` webpack
plugin its documentation leads with.

**Why:** that plugin hooks Next's webpack configuration, and Next 16 builds with
Turbopack. It does not fail — it prints a warning and produces no service worker
at all, which is the worst available outcome for a feature whose absence is
invisible until someone is offline. Compiling the worker with esbuild after
`next build` has emitted the assets it needs to list sidesteps the bundler
question entirely.

**Why offline at all:** everything personal already lives in IndexedDB on the
device (§ D1). An app that goes blank without a network is hiding data the user
is standing on top of.

**Consequence, on precaching:** `precachePrerendered` is off. `localePrefix` is
`as-needed` (§ D5), so prerendered HTML lands on disk under the locale segment —
`pt-BR.html`, `pt-BR/fontes.html` — while the app is served from unprefixed
URLs. Globbing the build output would fill the cache with keys no request ever
asks for. The two pages that must survive a cold start, `/` and `/~offline`, are
named explicitly and fetched through the proxy the way a browser would, keyed on
the commit SHA. `src/sw.test.ts` pins that URL across the three files that have
to agree on it and never import each other.

**Consequence, on updates:** `skipWaiting` and `clientsClaim` are both on. The
device holds the only copy of the user's data, so two versions writing to one
IndexedDB is a worse risk than an abrupt takeover.
