---
name: Dot Instrument
description: An instrument, not a document — two values, one red, and every quantity rendered as light on a dot grid.
colors:
  ground: "#ffffff"
  ink: "#000000"
  red: "#d71921"
  redInk: "#d71921"
  unlit: "#d4d4d4"
  dim: "#6b6b6b"
  dark:
    ground: "#000000"
    ink: "#ffffff"
    red: "#d71921"
    redInk: "#ff4a52"
    unlit: "#262626"
    dim: "#8a8a8a"
typography:
  display:
    family: Dot matrix (built, src/components/dot)
    size: fitted, 26px cell pitch maximum
    weight: n/a
    tracking: 6 cells per character
  headline:
    family: Space Grotesk
    size: 1.5rem
    weight: 600
    tracking: -0.025em
  title:
    family: Space Grotesk
    size: 1.125rem
    weight: 600
    tracking: -0.025em
  body:
    family: Space Grotesk
    size: 0.875rem
    weight: 400
    tracking: normal
  label:
    family: Space Grotesk
    size: 0.75rem
    weight: 500
    tracking: 0.22em
    transform: uppercase
  data:
    family: Space Mono
    size: 0.75rem
    weight: 400
    numeric: tabular-nums
rounded: "0"
spacing:
  column: 48rem
  gutter: 1.5rem
  sectionGap: 2.5rem
  stackGap: 0.75rem
  segmentGap: 3px
components:
  action:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground}"
    typography: "{typography.body}"
    rounded: "{rounded}"
    padding: 0.75rem 1.25rem
  rule:
    backgroundColor: "{colors.ink}"
    height: 2px
    width: 100%
  segment:
    backgroundColor: "{colors.unlit}"
    height: 1.25rem
    rounded: "{rounded}"
  tabSlot:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    height: 4.25rem
    rounded: "{rounded}"
---

## Overview

**North Star: an instrument, not a document.**

DietKit reports the state of one person's body and one day's plan. That is an
instrument's job, and an instrument shows quantity as light: lamps that are on
or off, digits built from dots, a rule where a card would be. Nothing on the
screen is a container for content — everything on the screen is a readout.

The visual world is Nothing OS, pinned by the user and followed literally: two
values and one red, dot-matrix type, exposed mechanism, hard edges. It is not a
mood reference. The dot face is really built (`src/components/dot/`), on a real
5x7 cell, because Ndot and NType82 are proprietary and cannot ship; the tab-bar
pictograms are drawn on the same grid so the navigation and the headline are
made of the same material.

The scene decides the rest. This app gets read at arm's length, over a kitchen
scale or in a gym, in whatever light is there. So contrast is absolute rather
than tasteful, state is carried at least twice, and the one number the screen
exists for is larger than everything else by a wide margin.

Reading order is the loop the product is: **target, then how far the plan has
got with it, then the body that says whether any of it is working.** Anything
outside that loop is one tab away, in `/mais`.

## Colors

Two values and one warning. Black and white are pure — `#000000` and `#ffffff`,
not the softened near-blacks most apps are made of — because the legibility
argument rests on absolute contrast.

| Token | Light | Dark | What it is |
|---|---|---|---|
| `--nd-ground` | `#ffffff` | `#000000` | The surface. |
| `--nd-ink` | `#000000` | `#ffffff` | Type, rules, lit segments, inverted fills. |
| `--nd-red` | `#d71921` | `#d71921` | The mark: a fill or a lit segment. Held to 3:1, which is what non-text UI needs. |
| `--nd-red-ink` | `#d71921` | `#ff4a52` | The same signal as *type*. 5.19:1 on white, 6.35:1 on black. |
| `--nd-unlit` | `#d4d4d4` | `#262626` | A cell that is off. Never text. |
| `--nd-dim` | `#6b6b6b` | `#8a8a8a` | The only secondary ink, and the only grey any text may take. 5.33:1 / 6.08:1. |

Three rules govern the palette:

- **Red means something is off** — over target, overdue, off plan. It is never
  decorative and never a brand flourish. Because it carries meaning it never
  carries it alone: every red mark in this codebase sits next to a word or a
  change in dot density, so the ~8% of men who do not see it lose nothing.
- **Red as a mark and red as type are two tokens.** One value cannot clear 3:1
  as a fill and 4.5:1 as text on both grounds. `--nd-red` fills, `--nd-red-ink`
  is set.
- **Intermediate tone is dot density, never grey fill and never opacity.** A
  shaded surface is `.nd-screen`: full-value dots at a 4px pitch, averaged by
  the eye. It is made of the same material as the type, so a shaded panel and a
  lit numeral belong to one system. Opacity would produce a value that is in no
  palette and means nothing.

Both themes are first-class. Dark is not an inversion of light — `--nd-red-ink`
and `--nd-unlit` are re-picked so the accent and the unlit grid hold on black.

## Typography

Three faces, and only one of them is a font.

**The dot face** is the display voice, built in `src/components/dot/`. A 5x7
glyph body sits on a 10-row cell (row 9 is the descender zone for the comma and
the cedilla); the advance is 6 columns, five of body plus one of side bearing,
which is what lets the unlit grid behind a word tile seamlessly and read as one
panel of hardware rather than as separate letters. A lit dot is `0.76em` across
and an unlit one `0.44em`: the difference is the whole legibility of the panel,
because a lit dot has to win against the grid it sits in, the way a bulb blooms
past its own aperture. Made equal, the number stops being a number and becomes
texture. Everything is expressed in `em` against the pitch, so `fontSize` is the
single dial for the whole panel. There is no lowercase — `glyphFor` upper-cases.

**Space Grotesk** is every word on the screen, and it is here because the faces
this direction actually points at cannot be had. Nothing's Ndot and NType82 are
brand assets that are not sold at any price, and Lettera Mono LL is a commercial
Lineto licence this project has not bought; all three were compared against the
running screens and none of them may ship. Space Grotesk is SIL OFL, so it can
be served by anyone who hosts this build. What earns it the job rather than
merely permitting it is that it was drawn from a monospace skeleton: wide, flat,
squared-off letterforms out of the same family of shapes as the dot panel above
them, which is the continuity the previous face could not give.

**Space Mono**, by the same hand, is for figures that sit in a column next to
other figures; `font-variant-numeric: tabular-nums` is applied to it, to tables,
and to anything marked `[data-numeric]`. It ships two weights, so a 600 in the
ramp below resolves up to 700 rather than being synthesised.

The root size is `106.25%` — 17px against a default browser. Space Grotesk
carries a smaller x-height than the face it replaced, and dropped in one-for-one
it read a step smaller on every screen. A percentage rather than a pixel value,
so it multiplies whatever base size the reader has asked their browser for
instead of overriding it; everything else is sized in rem, so the one number
moves the type and the rhythm around it together.

The ramp, in the order it appears on a screen:

| Role | Set as | Where |
|---|---|---|
| Display | Dot panel, pitch fitted to the column, capped at 26px | The day's energy target |
| Readout | Dot panel, fixed 16px pitch | The body weight |
| Headline | 1.5rem / 600 / `-0.025em` | Empty-state titles |
| Title | 1.125rem / 600 / `-0.025em` | The diet's name |
| Label | 0.75rem / 500 / `0.22em` / uppercase | The legend over every readout |
| Body | 0.875rem / 400 | Every sentence |
| Data | Space Mono 0.75rem, tabular | The reading beside a macro strip |
| Tab | 0.5625rem / `0.14em` / uppercase | The five slots |

The display pitch is fitted, not fluid: `min(26px, (min(100vw, 48rem) - 3rem) /
(digits * 6))`. The `26px` ceiling is what a real display does — the pitch stops
growing, so a three-digit target is a visibly *shorter* panel than a four-digit
one, rather than the same block of light with fatter dots in it.

Every visible string comes from next-intl. `react/jsx-no-literals` is on with
`noStrings: true` across `src/**/*.tsx`, so a hard-coded word is a lint failure.

## Layout

One column, `max-w-3xl` (48rem), centred, with a `1.5rem` gutter on each side.
There is no second column and no sidebar at any width: the desktop view is the
phone view with air around it, because the phone is where this is used and a
layout that reflows into panels at 1280px would be two designs to keep true.

Vertical rhythm is two gaps. Sections are `2.5rem` apart, separated by a rule;
inside a section, the stack is `0.75rem`, opening to `1.5rem` where a section
holds several readouts. Segments in a strip are `3px` apart — a hairline, so the
strip reads as one instrument that happens to be divided, not as a row of boxes.

The shell is fixed at both ends. A sticky name plate on `.nd-screen` with a 2px
ink rule under it; a fixed five-slot tab bar with a 2px ink rule over it, its
own `env(safe-area-inset-bottom)` padding, and a matching
`pb-[calc(4.5rem+env(safe-area-inset-bottom))]` on the scrolling body so the
last row of content is never under the bar.

Sections are ordered by the loop, not by importance-in-the-abstract: target,
macros, plan, body. The target is what you act on; the plan is how far you have
got with it; the body is the evidence, and it is also the thing that changes
least often, so it goes last.

## Elevation & Depth

**There is none, and that is the position.**

No shadow, no blur, no gradient, no translucency, no layered surface. Depth in a
system like this is a lie about a screen that is flat, and it costs contrast the
scene cannot spare.

Separation is done three ways instead:

1. **Rules.** A 2px ink line, full-bleed within the column. The world here is
   ruled sheets, not floating boxes.
2. **Inversion.** A selected or primary surface swaps ground and ink outright.
   Never a tint, never a 10%-alpha fill. `.nd-invert` also flips the focus ring
   to `--nd-ground`, because an ink ring disappears into an ink fill.
3. **Density.** `.nd-screen` shades a surface with dots when it needs to sit
   back from the page without a border.

## Shapes

**Radius is `0` everywhere.** Not "small" — zero, including on the focus ring,
which is explicitly reset because a UA rounds it by default.

The only curve in the system is the dot, and it is the *unit*, not an edge
treatment: `border-radius: 50%` on the dot cell's `::before`, and the same
circle in the `radial-gradient` that paints unlit cells and `.nd-screen`.

Borders are 2px and ink. There is no 1px border and no hairline divider in a
lighter grey — a border in this world is a structural line or it is absent.

## Components

The shared vocabulary lives in `src/components/nd/kit.tsx` — `Shell`, `Notice`,
`Rule`, `Hairline`, `Legend`, `Action`, `ActionButton`, `TextLink` and `Ghost`.
A screen that reaches for a raw `<button className="bg-nd-ink …">` has forked
the button; import it instead.

**Action** — the only button. An inverted block: ink ground, ground text,
uppercase at `0.08em`, `0.75rem 1.25rem`, `w-fit`. It is deliberately the only
filled element on a screen besides lit segments, so "the thing to do next" is
findable without reading. `Action` is the link form, `ActionButton` the button
form; they share one class string so they cannot drift apart.

**Ghost** — the secondary action: an ink outline at `text-xs`, uppercase,
smaller than `Action` in every dimension. Used where a row needs a control that
must not compete with the screen's one intention — add a meal, remove an item.

**FileField** — the file input, in `src/components/nd/FileField.tsx` because it
holds state and `kit.tsx` has to stay importable from a server component. The
native control is the one widget a browser draws in its own voice, labelled from
the *browser's* locale rather than the page's — "Choose File / No file chosen" on
a Portuguese screen. The input stays, hidden with `sr-only` so it keeps focus and
its label, and a `<label>` drawn as an `Action` opens the dialog. The chosen
filename sits beside it in mono.

**TextLink** — an aside, not an intention. Underlined running text at the
paragraph's own size. If a link deserves a filled block it is an `Action`; if it
deserves an outline it is a `Ghost`; everything else is this.

**Rule** — `<hr>` with the border zeroed and `border-top: 2px` ink. Sections are
divided by these; nothing is wrapped in a card. `Hairline` is its quiet
counterpart at 1px `--nd-unlit`, and it is *only* for separating repeated rows
of the same kind — a list of meals, a list of entries. A hairline between two
different sections is a rule that lost its nerve.

**Legend** — the tiny letter-spaced uppercase label above a readout, rendered as
whatever heading level the document needs via `as`. It is the carried exception
recorded at the foot of this document; because it is a single component, the
exception has exactly one implementation.

**Strip** — a bare row of `flex-1` segments with no label, no reading and no
status line, `aria-hidden` in full. It is what a `GlyphBar` becomes when the
words beside it already exist elsewhere on the row. It takes `quiet`, which
draws a shortfall still rather than seeking: the one animation in the app
belongs to the day's verdict, and a screen that repeats it once per meal has
thirty strips pulsing at once and has taught the reader to ignore all of them.

**Segment (`.nd-seg`)** — the atom of the whole system: a rectangle that is
lit, unlit, over, or seeking. Its state is a *string*, never a boolean, because
it has three lit states and a fourth resting one:

| `data-lit` | Appearance |
|---|---|
| absent / `off` | `--nd-unlit` |
| `on` | `--nd-ink` |
| `over` | `--nd-red` |
| `short` | The `nd-seek` pulse |

**GlyphBar** — label and mono reading on one baseline, a full-width strip of
`flex-1` segments under it, a status line under that. The strip is
`aria-hidden`; the status line says the same fact in words, which is both the
accessible path and the colour-blind path.

**MealLamps** — one fixed-width lamp per meal in the plan, lit if the meal has
food in it. Fixed-width rather than stretched on purpose: four lamps spread
across the column would read as a progress bar at 25%, which is a different
quantity entirely.

**DotText / DotIcon** — the dot panel. `DotText` renders the dots `aria-hidden`
and puts the real string in an `sr-only` span beside them, so the panel is a
*rendering* of the text and never a second copy of it. `DotIcon` draws one
pictogram from the same grid.

**Tab slot** — `4.25rem` minimum, pictogram over label over a lamp. The active
slot inverts *and* lights its lamp; inactive slots keep the lamp's space
transparent so nothing shifts. A "soon" slot is `--nd-unlit` and `aria-disabled`.

**Motion** — one authored animation in the entire app: `nd-seek`, a single pulse
travelling across the unlit segments of a macro that is short, 2200ms on
`cubic-bezier(0.16, 1, 0.3, 1)`, staggered 55ms per segment. A macro that is met
is still. That makes "not there yet" something the screen *does* rather than
something it says, readable from across a kitchen. Under
`prefers-reduced-motion` the animation is off and every transition is clamped to
1ms.

## Do's and Don'ts

**Do**

- Carry state at least twice — by light *and* by words. Colour may never be the
  only carrier of meaning on any screen in this app.
- Reach for a rule before a container. If something needs separating, draw the
  line; if it needs to sit back, shade it with `.nd-screen`.
- Give a quantity a readout. If a number is small and countable, it is lamps; if
  it is the answer the screen exists for, it is a dot panel.
- Let the dot panel size itself from one `fontSize`. Everything inside it is in
  `em`, so one value moves the dots, the spacing and the box in register.
- Pass `.nd-seg` a state name — `"on"`, `"over"`, `"short"` — never a boolean. A
  boolean stringifies to `"true"`, which matches no rule, and the lamp silently
  renders unlit.
- Put every visible string in `messages/pt-BR.json`.

**Don't**

- Don't introduce a second hue. Red is the only one, and it means "off target".
- Don't fade type to make it secondary. `--nd-dim` is the entire secondary ink
  budget; below it, remove the text instead.
- Don't add a radius, a shadow, or a gradient — including the "subtle" kind.
- Don't animate anything else. The seeking pulse is the app's one motion, and a
  second one dilutes it into decoration.
- Don't render the same number in two different voices. The energy target and
  the body weight are measurements of the same body; setting one in light and
  the other in running text says they came from two different instruments.
- Don't stretch a small-count indicator to full width. Full width means "a
  proportion of a target"; that is what `GlyphBar` is for.

---

## Deliberately not canonized

The screens use tiny letter-spaced uppercase labels above their headings
("META DE HOJE", "A DIETA DE HOJE", "O CORPO"). Under a general craft floor
these read as eyebrows, which are banned outright. They are kept here because
the pinned world makes them native — a legend over a readout is how instrument
panels label things, and it is a typographic system rather than a decorative
kicker. **This is recorded as a carried exception, not promoted to house style:**
in any other visual world in this codebase, an eyebrow is still wrong.

Separately, `/peso`, `/alimentos`, `/perfil` and `/energia` still carry the
previous amber/emerald convention. They are not yet part of this world and
nothing above describes them. `/dieta` and `/importar` were brought over with
the day panel and the meal panel; `/peso` still has no chart vocabulary in this
world, which is a decision owed rather than an omission.
