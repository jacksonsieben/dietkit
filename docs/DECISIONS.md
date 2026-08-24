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

**Consequence, on the notices:** three documents at `/privacidade`, `/termos`
and `/saude`, sharing one effective date from `src/lib/legal.ts` because they are
one agreement in three parts — the terms defer to the health disclaimer, and the
disclaimer is what makes the terms' positioning mean anything. The health page
names `Lei nº 8.234/1991` and the CFN outright rather than hedging with "consult
a professional", which is advice every app gives and which says nothing about
Brazil.

**Consequence, on what the terms may claim:** the liability section does not
attempt a blanket disclaimer. CDC art. 51 voids those against consumers, so one
would be unenforceable *and* evidence nobody read the law; the text states the
real limits of an estimate and then says consumer law prevails where they
conflict.

**Consequence, on the privacy notice:** it discloses the two things that do leave
the device — the search term sent to query TACO, and Vercel's request logs (IP,
user agent, URL) — because § D1 is only worth claiming if the honest version is
still a good answer. It also names why there is no "cookieless" analytics, per
§ D9.

**Consequence, on reachability:** `LEGAL_ROUTES` is one list, rendered by the
layout footer so every screen carries it — #10 asks for onboarding and settings,
neither of which exists yet, and a launch blocker parked behind an unwritten
screen is how one goes missing. `src/lib/legal.test.ts` checks that each route
has a page, has a label, and is actually iterated by the footer rather than
merely imported. When #12 lands, the disclaimer should also appear beside the
body-metrics input, where it is load-bearing.

**Open before launch:** the copy is drafted by an engineer and wants a Brazilian
lawyer's read, particularly the CFN positioning and the CDC section.
`LEGAL_CONTACT` carries a `TODO` for a named *controlador* under LGPD art. 41.

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

---

### D16 — The exercise catalog is ours, bundled for the gym and seeded for the key

There is no TACO for exercises. The 117 movements in `src/lib/training/catalog.ts`
are written by this project, and the file ships two ways: bundled into the client
as a typed module, and seeded into Neon's `exercises` table by
`npm run db:seed:training`.

**Why author it:** no Brazilian exercise dataset is published under terms we can
take. The alternatives were scraping someone's app, which is the thing TACO's
licence taught us not to do (§ D4), or shipping an empty screen. A hundred-odd
movements in pt-BR is an afternoon of writing and it is unambiguously ours.

**Why bundled:** this catalog is read in a gym, which is frequently a basement
with concrete walls, and a screen that has to reach the network to name the next
exercise is a screen that fails precisely where it is used. It is a few kB of
strings — the same argument as § D1, arrived at from the other direction.

**Why also in Postgres:** `training_preset_items.exercise_slug` is a foreign key
to `exercises.slug`, and shared presets are reference data (§ D1) — they contain
nobody's numbers. The rows exist so the presets have something to point at, not
to be fetched by a screen.

**Consequence, on the two copies of the enums:** `catalog.ts` declares
`MUSCLE_GROUPS` and `EQUIPMENT` itself because it is bundled with the client and
may not import drizzle (`eslint.config.mjs` § `no-restricted-imports`), while
`schema/exercises.ts` declares them as pgEnums. `src/lib/db/exercises.test.ts`
asserts the two lists are the same, in order, and puts the whole catalog through
a real Postgres to prove every value is one the migration accepts.

**Consequence, on `position`:** it is derived from reading order in
`catalogRows()`, not authored. A hand-kept `position: 7` drifts the first time a
movement is inserted mid-group; deriving it means that insert is one line.

**Consequence, on provenance:** the seed writes a `dataset_versions` row like
TACO's, but naming DietKit as the author and saying outright that it derives from
no publication, pinned to the SHA-256 of `catalog.ts`. A blank provenance field
would read as an oversight and a borrowed one would be worse. Editing the catalog
writes a new version row; re-running on an unchanged file updates the one it has.

**Consequence, on load:** there is still no column for a kilogram anywhere in this
database (`schema/presets.ts`). What someone lifts is personal data and stays on
the device.

---

### D17 — The splits are authored the same way, and their days are rewritten rather than upserted

`src/lib/training/splits.ts` holds four programs — full body, upper/lower, the
ABC, push/pull/legs — as slugs, day names and prescribed ranges. Same three
reasons as § D16: nobody publishes these under terms we can take, they are read
in a basement, and `training_preset_items.exercise_slug` is a foreign key.

**Why the splits and not just the catalog:** a list of a hundred and seventeen
movements is not an answer to "what should I be working out today". A split is.
The catalog is the vocabulary; this is the first thing said with it.

**Consequence, on the seed:** one command, `npm run db:seed:training`, writes
both files inside one transaction. A split written before the exercises it names
is a foreign key violation, and an ordering a person has to remember is one that
will eventually be got wrong against production. `scripts/training/seed.test.ts`
runs `writeSplits` against an empty PGlite to keep that failure real.

**Consequence, on provenance:** a second `dataset_versions` row, `dietkit-splits`,
pinned to the SHA-256 of `splits.ts`. Two files produce two sets of rows, and the
point of that table is to answer which file produced which — sharing one hash
would mean editing a rep range invalidated the catalog's row.

**Consequence, on how the rows are written:** `exercises` is upserted on its slug
because things point at it. The days and items are deleted and re-inserted,
because nothing does: a day's identity is a serial id that appears nowhere else,
and a device stores the preset slug and the day's *position* — a device holds
personal data and does not get to depend on a server-side key (§ D1). Rewriting
is exact, where upserting would leave an item removed from the middle of a day
stranded at position 7.

**Consequence, on load:** unchanged, and worth repeating because this is the file
that would tempt someone. A rep range is a prescription, identical for everyone
reading this build. A kilogram is what one person lifted on one day.

---

### D18 — Training is a rotation, not a calendar

The training screen tracks which split you are running and which of its days
comes next. Finishing a session moves that pointer on by one and wraps at the
end. Nothing in the feature knows what day of the week it is.

**Why not a weekday schedule:** because a schedule has to decide what a missed
Tuesday means, and every available answer is wrong for somebody. Skip it, and
the person who trains four times most weeks loses a session for being ill. Push
everything, and the calendar drifts until it is a rotation with extra steps.
Mark it late, and the app spends its one notification budget nagging. A rotation
has no opinion about the gap: you were on B before the flu and you are on B
after it, which is also how the people this is for already talk about training
("hoje é o B").

**Consequence, on the device:** two facts and a timestamp —
`{ splitSlug, nextDay, lastFinishedAt? }` in `TrainingRotation`. The split
itself is reference data in the bundle (§ D17), so the device stores a slug and
an index rather than a copy of the program, and a build that rewrites a rep
range fixes it everywhere without touching anyone's data.

**Consequence, on the server:** none. Which split someone runs, and how far
through it they are, is personal data under § D1 — it lives in IndexedDB and the
server is never told. `/treino` is therefore a static shell with a client
component inside it, prerendered identically for everyone, and there is still no
column anywhere for a load in kilograms.

**Consequence, on the split changing under it:** the index is wrapped and the
slug may fail to resolve, both handled rather than trusted. A split shortened
between releases comes round to its first day instead of pointing past its last;
a slug this build has dropped renders as "choose again" with the old name shown,
because quietly resetting someone's choice is a trust cost you cannot see you
are paying.

**Consequence, on backups:** `SNAPSHOT_SCHEMA_VERSION` went to 2. A version 1
file restores unchanged — an absent `training` section reads as a device that
has not chosen a split, which is exactly what it is.

---

### D19 — The training log is on-device, and a set is what happened

Finishing a session writes a record: the date, the split and day it came from,
and per exercise an ordered list of sets carrying reps, an optional load in
kilograms, and whether it was done. That record goes to IndexedDB and nowhere
else. It is written once, at the finish, from a draft that lives in React state
and is thrown away if the tab closes.

**Why nothing goes to the server:** a rep range is a prescription and a kilogram
is a person. § D1 has said so since the first table was drawn, and this is the
feature that would have made it convenient to stop meaning it — a log is a time
series, a time series wants a database, and there is one right there with the
exercises in it. But the thing that would be stored is the most personal record
this app can hold: how strong someone is, how that changed, and which weeks they
did not show up. `src/lib/db/boundary.test.ts` fails a server column whose name
sounds personal, so the convenient version does not compile, and the honest
version is a Dexie table.

**Consequence, on what a set means:** a set is logged as what happened, not as
what was asked for. The day prescribes 4×8; if the fourth set was six reps at a
lighter load, six is what is written, and a set that was never checked off is
left out of the record entirely rather than stored as a zero. Nothing rounds a
bad session up. This is not a scruple about tidiness — the next slice suggests
the next load from these numbers (#80), and a log that flatters the user is a
log that will tell them to add weight after the session where they could not
finish the third set.

**Consequence, on the draft:** an in-progress session is not persisted. The
issue asks for a store of *finished* sessions, and a half-written one saved on
every checkbox is a second kind of record with its own resume semantics, its own
staleness question ("this session is from Tuesday, continue it?") and its own
way of getting out of step with the rotation. Losing a session to a closed tab
is a real cost and it is the smaller one; the wake lock that keeps the screen on
through a session is #83.

**Consequence, on the fields:** a bodyweight movement — one whose equipment is
`peso-corporal` — has no load field, because a chin-up does not weigh anything
and a `0 kg` in the record is a number that will later be averaged. Adding a
belt is an addition and reads as one: an explicit "pôr carga" that turns the
load on for that set. A unilateral movement shows the split ("8 por lado") and
steps in twos, so the number on screen is the number the person counts and the
number in the record is still the total.

**Consequence, on backups:** `SNAPSHOT_SCHEMA_VERSION` went to 3. Versions 1 and
2 restore unchanged — an absent `trainingSessions` section is a device that has
not logged anything, which is what it is. A log that only exists on one phone is
a log that one dropped phone deletes, so the backup file is the only copy that
outlives the device, and it stays a file the person holds rather than a row we
hold for them.

**On openGym:** the shape of this feature was worked out after reading openGym
(AGPL-3.0), which is where the rest timer between sets, the pre-fill from last
time and the per-set done state come from as *ideas*. No code and no data were
taken from it; nothing in this repository is derived from that project, and it
is named here because studying a good answer and then writing your own is worth
recording either way.

### D20 — The next load is derived, never stored

Every time the training screen opens, `src/lib/training/progression.ts` reads
the log and works out what to do today: the reps, the load, and a tagged reason
for both. Nothing is written back. There is no "current load" field on an
exercise, no `nextWeight` in the rotation, no cached prescription anywhere —
because the log already contains the answer, and a second copy of an answer is
a thing that can disagree with the first.

**Why derive it every time:** the alternative is one number that has to be kept
correct through every edit, and the edits are the interesting part. Somebody
types 12 where they did 2, closes the screen, notices, and fixes it. With a
stored load, the fix repairs the history and leaves today's prescription
sitting on the mistake. With a derived one, the fix *is* the fix: correcting a
set from three weeks ago corrects today's number on the next render, and there
is nowhere for the two to drift apart. The computation is a filter and a couple
of `Math.min` calls over a handful of sessions, which is not a cost worth
buying a consistency problem to avoid.

**Double progression, because the data says so.** Our splits ship rep *ranges*
(`reps: [min, max]`, since § D17 and #74). The rule that matches ranges is:
work from the bottom of the range to the top at one load, hold the top in every
set, then add the smallest pair of plates and drop back to the bottom. openGym
defaults to linear progression — add weight every session — because its card
carries a single rep target; ours does not, and picking the rule the data was
written for is cheaper than converting the data to the rule.

**Reading a session honestly.** A session counts as a hit only if every
prescribed set was done, at the load the first set was worked at, at or above
the bottom of the range. Fewer sets than the card asked for is a miss. A set
where the weight came off is a miss — 60, 60, 55 is not three sets of 55, and
reading it as the lightest set would offer to add weight to a session that fell
apart. A miss holds the load and re-asks for the best set of the day, clamped
back into the range; it never advances.

**Stalls are counted at the load being worked**, not across the whole history.
Three misses in a row backs the load off by a tenth, snapped *down* onto the
2.5 kg grid — down, because rounding to the nearest turns a tenth off 5 kg back
into 5 kg, which is the app announcing a change and not making one. Counting at
the current load is what makes the deload self-clearing: the sessions after it
are lighter, so the misses that triggered it are no longer being counted and
the next stall starts from one. Counting across the whole history would deload
again on every session forever.

**Bodyweight progresses in reps**, and the trigger is the load that was
*logged*, not the equipment flag — a dip with a belt on it has a load to add
to. Past the top of the range with nothing on the bar there is no honest "one
more rep" left, so the app says to add weight or move to a harder variation
rather than proposing a fortieth push-up.

**Reasons are data, not sentences.** `progression.ts` returns
`{ kind: "addLoad", reps: 12 }`; `Training.tsx` turns it into "você fechou 12
repetições em todas as séries". A sentence assembled in `lib` is a sentence
next-intl never sees and nobody can rewrite (§ D5) — and a rep count inside a
reason is a total across both sides, halved on the way to the screen like every
other rep count. The line shows on every movement, including the weeks where
the answer is "one more repetition", because a reason that only appears when
something interesting happens is a reason nobody learns to read.

**Consequence, on the draft:** the prescription *is* the pre-fill. Every set of
a movement opens on the same numbers, which is what a straight prescription is;
#79 opened each set on the corresponding set from last time, and that put a
ragged 8/7/6 on screen as a target nobody had prescribed — which the rule would
then read back as a session of sixes. What happened is typed over the top of
what was asked for, which is the right way round. The set *count* still comes
from the card, and the extra set is still one tap away.

**On openGym:** its rules were read (AGPL-3.0) and its defaults deliberately not
copied. No code and no data were taken.

### D21 — A one-rep max is an estimate, and it says whose set it is

**#81.** The log is only worth keeping if it answers "am I getting stronger",
and that answer is a curve, not a row. Four decisions make the curve honest.

**One point per session, and it is the best *estimated* set, not the heaviest.**
A day of 100 × 10 is a better day than 135 × 1 for almost everybody, and a chart
that plots the heaviest bar would draw that as a peak. `bestSet` ranks by
estimate and only falls back to the heavier load to break a tie.

**Epley, capped at twelve repetitions.** Past twelve the formula stops being an
estimate and starts being a genre — it will happily turn a set of thirty into a
number nobody could lift — so the app prints nothing instead of a confident
wrong one. A single is returned as itself rather than run through the formula,
which would inflate it by 3.5% for no reason: the set *is* the measurement. No
load, no estimate; a bodyweight movement gets its rep record as the headline
instead, because a zero in the panel would be the screen calling a set of
fourteen pull-ups nothing.

**Every estimate names the set it came from.** "137 kg estimado" alone is not a
claim anybody can check. "137 kg estimado, de 100 × 10" and "137 kg, de 135 × 1"
are different claims about the same number and the reader is owed the
difference — which is also why the rep record names its load: fourteen at sixty
and fourteen at twenty are not the same achievement.

**Records are derived, never counted.** `movementRecords` reads the log every
time, so there is no stored best that can drift out of step with what was
actually lifted (§ D19, § D20) — and "you broke a record" at the finish is the
same function asked twice, once about the log without this session and once
about the log with it. Equalling a record is not breaking it, and a first-ever
session breaks nothing: there was no record to beat.

**Unilateral reps stay per side, everywhere.** The cap and the formula both see
the per-side number, so twelve per arm is a set of twelve and not a set of
twenty-four the app refuses to estimate. The halving happens once, in
`history.ts`, for the same reason it happens once in `log.ts`.

**One chart engine.** `src/lib/chart.ts` is the geometry — band, floor, dates to
distance — and `src/lib/weight/chart.ts` is now a wrapper over it that keeps
speaking kilos and moving averages. The weight chart's tests were not touched
when the arithmetic moved out from under them, which is the whole reason to
believe the move changed nothing. The strength chart reads in the same
vocabulary: unlit dots are the load actually lifted, the ink line is the
estimate, and the gap between them is the reps.

**One route, not one per movement.** `/treino/historico` picks a movement with
chips. A `[slug]` segment would prerender two hundred catalog pages to hold the
fifteen anybody trains.
