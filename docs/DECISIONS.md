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

### D9 — Cookieless analytics only

No conventional analytics tag, ever.

**Why:** it would break the "we collect nothing" claim and re-create precisely
the LGPD obligations the architecture exists to avoid. The privacy posture is a
feature, and it is only credible if it has no exceptions.

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
