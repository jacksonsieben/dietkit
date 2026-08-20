# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One confirmed user today — the author — building for himself first, with the
explicit expectation that this becomes a product for other people later. Design
decisions must therefore hold for a stranger even while the only account is the
author's: no in-jokes, no undocumented shorthand, no screen that only makes
sense to someone who read the source.

The situation is not a desk. It is a phone in a kitchen while portioning food,
and — from V2 — a phone in a gym between sets. Both are one-handed, both are
interrupted, both are cases where the answer has to be readable at a glance
rather than assembled by the reader.

## Product Purpose

DietKit turns a person's body numbers into an eating plan built from real
Brazilian food data, and then tells them whether the plan is working.

Success on day 200 is that opening the app answers "what am I eating today" and
"is this working" without navigation, and that logging a weigh-in costs one tap
from wherever the user already is.

## Positioning

The whole product runs on the user's own device. Every piece of personal data —
profile, weight history, diets, custom foods, substitution groups — lives in
IndexedDB and is never transmitted. The server holds reference data only. This
is a hard architectural commitment, not a privacy posture, and it is the thing a
neighbouring calorie tracker cannot truthfully copy: there is no account, no
sync, and nothing to leak.

Food data is TACO (Tabela Brasileira de Composição de Alimentos), which means
the numbers match Brazilian food rather than a US database's approximation of
it.

## Operating Context

The product is a loop, not a set of screens:

    profile & targets -> diet plan -> eating -> weigh-in -> back to targets

A new weight moves the targets, which moves the plan. Most days touch only two
points on that loop: read the plan, record the weight. The other points are
touched monthly or less.

Installed to the home screen as a standalone PWA, so there is no browser back
button and no browser chrome. Used mostly on a phone; sometimes on a desktop,
where the layout must not look broken.

Because storage is local and un-synced, an exported backup file is the only
thing standing between the user and total loss. Backup is a first-class product
concern, not a settings-page afterthought.

## Capabilities and Constraints

- pt-BR is the only shipped locale. Every visible string comes from next-intl;
  hard-coded copy fails lint.
- Personal data must never reach the server. This is enforced by architecture
  (a `Repository` interface over IndexedDB) and by lint rules.
- No conventional analytics tag anywhere in the codebase.
- TACO attribution is a licence condition and must stay reachable from
  everywhere in the app.
- Current surface: 16 routes, one `<nav>` in the whole codebase, no app shell.
  This is the problem being solved.
- **V2, confirmed and load-bearing for IA now:** a training/workout view the
  user checks at the gym — "what should I be working out today". It is not built
  yet, but the navigation must be designed with a place for it rather than
  retrofitted, and it is a peer of the diet, not a sub-page of it.

## Brand Commitments

- Name: DietKit.
- The user has pinned **Nothing OS** as the binding visual reference for the
  interface. Recorded here as a constraint; its interpretation belongs to the
  visual world, not to this file.
- Legal notices (privacy, terms, health disclaimer) and TACO credit are
  permanent parts of the product, not optional pages.

## Evidence on Hand

- A running app with real data: 2.180 kcal target, P 165 / C 220 / G 62,
  82,4 kg current, -1,8 kg over 19 days.
- TACO food data, ingested and searchable, in Neon.
- No customers, no testimonials, no press, no benchmarks. None may be invented.
- The controller identity in the legal notices is still a placeholder and must
  not be presented as real.

## Product Principles

1. **The loop is the product.** Every screen should say where it sits in
   profile -> plan -> eat -> weigh, and the home screen should reflect where the
   user actually is in it.
2. **Local-first is a promise, not a feature.** Nothing that would require an
   account, a sync, or a server-side profile may be designed in.
3. **Design for the 200th day, then make the first day survivable.** The common
   case is reading back a stable plan, not building a new one.
4. **One-handed, interrupted, mid-task.** Kitchen and gym, not desk.
5. **Leave a seat for training.** The IA is designed for two disciplines even
   while only one is built.

## Accessibility & Inclusion

Read at arm's length in bad kitchen light and worse gym light, one-handed, by
someone who is mid-task. Touch targets and type sizes take priority over
density. Colour may never be the only carrier of state.
