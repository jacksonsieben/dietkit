import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import { ACTIVITY_LEVELS } from "./activity";
import { PROFILE_ERROR_CODES, PROFILE_FIELDS } from "./validation";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #12 that are true about how the pieces are wired together rather
 * than about what any one of them computes. None of these can be asserted by
 * rendering the form: `next-intl/server` resolves to its client build under
 * Vitest, so a server component throws before it paints. Reading the source is
 * the honest fallback, and each check is written to fail if the thing it names
 * is removed rather than merely renamed.
 */
describe("profile form wiring", () => {
  it("has a message for every way a field can be rejected", () => {
    // The failure this prevents is silent: next-intl renders the key path when
    // a message is missing, so a new code ships as "Profile.errors.xyz" shown
    // in red under an input.
    for (const code of PROFILE_ERROR_CODES) {
      expect(ptBR.Profile.errors, `no message for ${code}`).toHaveProperty(code);
    }
  });

  it("has no message left over for a code nothing can produce", () => {
    expect(Object.keys(ptBR.Profile.errors).sort()).toEqual(
      [...PROFILE_ERROR_CODES].sort(),
    );
  });

  it("has a label for every rung of the activity ladder", () => {
    // TypeScript checks this too, via the literal `id` types and next-intl's
    // generated Messages type. The test is here because the ladder is the one
    // list a future contributor is most likely to extend, and a rung with no
    // label is a dropdown option reading "activityLevel.veryLight".
    expect(Object.keys(ptBR.Profile.activityLevel).sort()).toEqual(
      ACTIVITY_LEVELS.map((level) => level.id).sort(),
    );
    // The short form the ladder table on the energy screen uses.
    expect(Object.keys(ptBR.Profile.activityLevelShort).sort()).toEqual(
      ACTIVITY_LEVELS.map((level) => level.id).sort(),
    );
  });

  it("offers the ladder as a choice rather than a number to type", () => {
    // Nobody knows their own multiplier. 1,55 is not a fact anyone has about
    // themselves, and a free text field asking for one collects guesses — so
    // the ladder, not the box, is what the field opens as.
    const form = read("src/components/ProfileForm.tsx");
    const field = form.slice(form.indexOf('label={t("activityLabel")}'));
    const select = field.slice(0, field.indexOf("</Field>"));

    expect(select).toContain("<select");
    expect(select).toContain("ACTIVITY_LEVELS.map");
    expect(select).not.toContain('inputMode="decimal"');
  });

  it("shows the multiplier next to the rung it stands for", () => {
    // #14's first done-when. The factor is the only part of this calculation
    // that is a convention rather than a measurement, so it is the only part
    // someone needs in order to reconcile our answer with a different one.
    const form = read("src/components/ProfileForm.tsx");
    const field = form.slice(form.indexOf('label={t("activityLabel")}'));
    const select = field.slice(0, field.indexOf("</Field>"));

    expect(select).toContain('t("activityOption"');
    expect(select).toContain("formatFactor(format, level.factor)");
    expect(ptBR.Profile.activityOption).toContain("{factor}");
    expect(ptBR.Profile.activityOption).toContain("{label}");
  });

  it("lets the factor be typed instead of picked", () => {
    // The override, also #14. A ladder with no way off it tells someone who
    // knows their own number that we know better, and quietly rounds it.
    const form = read("src/components/ProfileForm.tsx");

    expect(form).toContain("CUSTOM_ACTIVITY");
    expect(form).toContain("{customActivity && (");

    const box = form.slice(form.indexOf("{customActivity && ("));
    expect(box.slice(0, box.indexOf("</Field>"))).toContain('inputMode="decimal"');
  });

  it("reopens the box for a stored factor no rung matches", () => {
    // Without this the select renders as though nothing were selected, and the
    // next rung the user touches overwrites the number they chose.
    const form = read("src/components/ProfileForm.tsx");

    expect(form).toContain("isCustomActivity(loaded.values.activityFactor)");
  });

  it("quotes the real bound in the override's hint", () => {
    // A hint saying "1 to 2.5" beside a validator that allows something else is
    // the kind of drift that only shows up as a rejected value with no reason.
    const form = read("src/components/ProfileForm.tsx");

    expect(form).toContain('t("activityCustomHint", PROFILE_LIMITS.activityFactor)');
    expect(ptBR.Profile.activityCustomHint).toContain("{min}");
    expect(ptBR.Profile.activityCustomHint).toContain("{max}");
  });

  it("renders and updates every field the validator knows about", () => {
    // A field that is validated but never rendered is a form that cannot be
    // submitted, with an error message pointing at nothing.
    const form = read("src/components/ProfileForm.tsx");

    for (const field of PROFILE_FIELDS) {
      expect(form, `${field} is never displayed`).toContain(`values.${field}`);
      expect(form, `${field} can never be edited`).toContain(`update("${field}")`);
      expect(form, `${field} never shows its error`).toContain(`errors.${field}`);
    }
  });

  it("reaches the device store only through the repository seam", () => {
    const form = read("src/components/ProfileForm.tsx");

    expect(form).toContain("getRepository()");
    // ESLint bans the import (eslint.config.mjs); this catches the same rule
    // being loosened rather than the import being added under it.
    expect(form).not.toContain("lib/storage/dexie");
    expect(form).not.toContain('from "dexie"');
  });

  it("tells the browser which scheme to paint its own widgets in", () => {
    // The `<select>` popup and the date picker are surfaces the browser draws
    // outside the page, and they read `color-scheme` — not the palette. Without
    // both halves of this the dropdown came out light-grey on white in dark
    // mode, which no screenshot of the page would ever have shown.
    const css = read("src/app/globals.css");
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));

    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light/);
    expect(dark).toMatch(/:root\s*\{[^}]*color-scheme:\s*dark/);
  });

  it("gives the dropdown rows a background of their own", () => {
    // `<option>` is not covered by the control's class — it is a separate
    // element the popup renders — so the colour has to be stated for it.
    const css = read("src/app/globals.css");

    expect(css).toMatch(/select\s+option\s*\{[^}]*background-color:\s*var\(--background\)/);
    expect(css).toMatch(/select\s+option\s*\{[^}]*color:\s*var\(--foreground\)/);
  });

  it("does not make a form control transparent", () => {
    // `bg-transparent` looks identical on the closed control, because the body
    // shows through. On the popup it is an author-declared background composited
    // over the browser's own surface, which is where the white came from.
    const form = read("src/components/ProfileForm.tsx");
    const controlClass = /^const CONTROL_CLASS =\n?\s*"([^"]*)"/m.exec(form)?.[1];

    expect(controlClass).toBeDefined();
    expect(controlClass).not.toContain("bg-transparent");
    expect(controlClass).toContain("bg-background");
    expect(controlClass).toContain("text-foreground");
  });

  it("precaches the screens that need no network to be right", () => {
    // "Works offline" in #12's done-when. Without an entry here a cold start
    // with no connection serves the /~offline fallback instead of the form,
    // even though everything the form displays is already on the device.
    const config = read("serwist.config.mjs");

    expect(config).toContain('{ url: "/perfil", revision }');
    // #14's screen computes from data already on the device, so needing the
    // network to display it would be offline-broken for no reason at all.
    expect(config).toContain('{ url: "/energia", revision }');
  });

  it("is reachable from the home page", () => {
    const home = read("src/app/[locale]/page.tsx");

    expect(home).toContain('href="/perfil"');
    expect(home).toContain('href="/energia"');
  });

  it("puts the health notice beside the body-metrics input", () => {
    // The follow-up docs/DECISIONS.md § D10 left open when #10 shipped: the
    // footer link is easy to walk past, and this is the screen where the
    // estimate actually gets made.
    expect(read("src/components/ProfileForm.tsx")).toContain('href="/saude"');
  });
});

/**
 * #14's second done-when — "the factor value shown numerically ... again under
 * the result" — and the note that goes with it. Same fallback as above: the
 * screen cannot be rendered under Vitest, so what is checked is that the pieces
 * the requirement names are present and reach the store the sanctioned way.
 */
describe("energy screen wiring", () => {
  const result = () => read("src/components/EnergyResult.tsx");

  it("shows the factor and the arithmetic it came from", () => {
    // A total with no equation is a number to trust or not. With `2045 × 1,55`
    // printed under it, a reader who got a different answer somewhere else can
    // see which of the two inputs differs.
    expect(result()).toContain('t("equation"');
    expect(ptBR.Energy.equation).toContain("{bmr}");
    expect(ptBR.Energy.equation).toContain("{factor}");
    expect(ptBR.Energy.equation).toContain("{tdee}");
    expect(result()).toContain('t("factorLabel")');
  });

  it("prints the factor to the precision the ladder actually holds", () => {
    // 1,375 rounded to 1,38 beside a result computed from 1,375 makes the
    // equation impossible to check by hand, which is the whole point of it.
    expect(result()).toContain("maximumFractionDigits: 3");
  });

  it("prices every rung for this body rather than describing the problem", () => {
    // The design stance in #14: make the number visible instead of arguing
    // about whose scale is correct. The gap between two rungs is the argument,
    // so the gap is what gets shown.
    expect(result()).toContain("summary.ladder.map");
    expect(result()).toContain('t("ladderCurrent")');
  });

  it("explains why two calculators disagree", () => {
    // "so users can reconcile rather than assume a bug", verbatim from #14.
    expect(result()).toContain('t("disagreement")');
    expect(ptBR.Energy.disagreement.length).toBeGreaterThan(120);
  });

  it("reaches the device store only through the repository seam", () => {
    expect(result()).toContain("getRepository()");
    expect(result()).not.toContain("lib/storage/dexie");
    expect(result()).not.toContain('from "dexie"');
  });

  it("says what is missing instead of showing a number built from nothing", () => {
    // Arriving before filling the profile is the ordinary path — the home page
    // links to both screens — and it is not an error state.
    const source = result();

    expect(source).toContain('state.status === "missing"');
    expect(source).toContain('t("missingProfile")');
    expect(source).toContain('t("missingWeight")');
  });

  it("puts the health notice beside the estimate", () => {
    expect(result()).toContain('href="/saude"');
  });
});
