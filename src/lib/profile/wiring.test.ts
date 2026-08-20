import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import { GOAL_ERROR_CODES, GOAL_FIELDS } from "@/lib/energy/goal";
import { ENERGY_UNITS, GOAL_KINDS } from "@/lib/storage/types";
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
    expect(ptBR.Profile.activityCustomHint).toContain("{min, number}");
    expect(ptBR.Profile.activityCustomHint).toContain("{max, number}");
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
    const shared = read("src/components/Field.tsx");
    // The class is composed from the pieces `UnitInput` reuses, so what has to
    // be opaque is the string that reaches an element — not the literal source.
    const piece = (name: string) =>
      new RegExp(`^const ${name} = "([^"]*)"`, "m").exec(shared)?.[1] ?? "";
    const controlClass = /^export const CONTROL_CLASS = `([^`]*)`/m
      .exec(shared)?.[1]
      .replace("${FRAME}", piece("FRAME"))
      .replace("${BORDER}", piece("BORDER"));

    expect(controlClass).toBeDefined();
    expect(controlClass).not.toContain("bg-transparent");
    expect(controlClass).toContain("bg-background");
    expect(controlClass).toContain("text-foreground");

    // The unit picker is a second `<select>`, built by hand out of the same
    // pieces rather than handed `CONTROL_CLASS` — a second chance at the same
    // regression, on the one control that is a popup by definition.
    const picker = shared.slice(shared.indexOf("export function UnitInput"));
    const select = picker.slice(picker.indexOf("<select"), picker.indexOf("</select>"));

    expect(select).not.toContain("bg-transparent");
    expect(select).toContain("bg-background");
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

  it("is reachable from the screen that holds everything outside the loop", () => {
    const more = read("src/app/[locale]/mais/page.tsx");

    expect(more).toContain('href: "/perfil"');
    expect(more).toContain('href: "/energia"');
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

/**
 * #15's done-when, checked where it is actually delivered: the calculation is
 * covered in `macros.test.ts`, and what is left is whether the screen shows
 * what the issue asks it to show. The last clause — "any rounding drift is
 * shown rather than hidden" — is the one a component can quietly fail while
 * every unit test still passes, by printing the target where the sum of the
 * grams belongs.
 */
describe("macro targets wiring", () => {
  const macros = () => read("src/components/MacroTargets.tsx");

  it("has a message for every way the goal form can be rejected", () => {
    for (const code of GOAL_ERROR_CODES) {
      expect(ptBR.Macros.errors, `no message for ${code}`).toHaveProperty(code);
    }
  });

  it("has no message left over for a code nothing can produce", () => {
    expect(Object.keys(ptBR.Macros.errors).sort()).toEqual([...GOAL_ERROR_CODES].sort());
  });

  it("has a label for every goal the form offers", () => {
    // The select is built by mapping GOAL_KINDS, so a goal added without a
    // message ships as an option reading "Macros.goal.recomp".
    expect(Object.keys(ptBR.Macros.goal).sort()).toEqual([...GOAL_KINDS].sort());
  });

  it("has a name for every unit the pickers offer", () => {
    expect(Object.keys(ptBR.Macros.unit).sort()).toEqual([...ENERGY_UNITS].sort());
  });

  it("renders every field the validator knows about", () => {
    const source = macros();

    for (const field of GOAL_FIELDS) {
      expect(source, `${field} is never displayed`).toContain(`values.${field}`);
      expect(source, `${field} never shows its error`).toContain(`errors.${field}`);
    }
  });

  it("lets every number under the goal be edited", () => {
    // `kind` is the exception, and deliberately: choosing a goal goes through
    // `chooseGoal`, which replaces the whole form with that goal's preset
    // rather than editing one field of the previous answer.
    const source = macros();

    for (const field of GOAL_FIELDS.filter((name) => name !== "kind")) {
      expect(source, `${field} can never be edited`).toContain(`update("${field}")`);
    }
    expect(source).toContain("onChange={(event) => chooseGoal(event.target.value)}");
  });

  it("asks one question, and fills the rest in from a preset", () => {
    // The redesign's whole point. The first version of this form opened by
    // asking for grams of fat per kilogram of bodyweight, which is a question
    // most people close the tab on rather than answer.
    const source = macros();

    expect(source).toContain("GOAL_KINDS.map");
    expect(source).toContain("presetForm(kind)");
  });

  it("folds the numbers away instead of dropping them", () => {
    // Collapsed, not removed and not moved to a settings page: someone who
    // disagrees with a preset is one click and the same save button away.
    const source = macros();

    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain('t("advancedLabel")');
    expect(source.indexOf("<details"), "the goal select is inside the fold").toBeGreaterThan(
      source.indexOf('t("goalLabel")'),
    );
  });

  it("asks for the adjustment as a goal plus an unsigned size", () => {
    // The sign lives in the goal, not in the number. A signed field is one
    // forgotten minus away from turning a cut into a bulk, with nothing on
    // screen looking wrong — the grams would simply all be larger.
    const source = macros();

    expect(source).toContain("needsAdjustment(kind)");
    for (const hint of [ptBR.Macros.adjustmentHint.kcal, ptBR.Macros.adjustmentHint.percent]) {
      expect(hint).toContain("{min, number}");
      expect(hint).toContain("{max, number}");
    }
  });

  it("puts the unit picker inside the input, on its right", () => {
    // The shape the user asked for, and the reason `UnitInput` exists at all: a
    // phone field's country selector, mirrored. A separate select underneath
    // would leave the number and its unit looking like two questions.
    const field = read("src/components/Field.tsx");
    const composite = field.slice(field.indexOf("export function UnitInput"));

    expect(composite).toContain("<input");
    expect(composite).toContain("<select");
    expect(
      composite.indexOf("<select"),
      "the unit picker sits to the left of the number",
    ).toBeGreaterThan(composite.indexOf("<input"));

    const source = macros();
    expect(source).toContain("units={ADJUSTMENT_UNITS}");
    expect(source).toContain("units={FAT_UNITS}");
    expect(source).toContain('unitLabel={t("unitLabel")}');
  });

  it("takes fat as a share of the energy rather than of the body", () => {
    // A fixed g/kg quietly takes a larger share of every deficit the user
    // deepens; a share does not. The kcal unit is still offered, and the hints
    // have to say which of the two bounds they are quoting.
    const source = macros();

    expect(source).toContain("fatLimits(fatUnit)");
    expect(source).toContain("t(`fatHint.${fatUnit}`");
    for (const hint of [ptBR.Macros.fatHint.percent, ptBR.Macros.fatHint.kcal]) {
      expect(hint).toContain("{min, number}");
      expect(hint).toContain("{max, number}");
    }
  });

  it("warns when the fat lands under the physiological floor", () => {
    // Reachable only through the kcal unit — the percentage bounds hold the
    // line. A warning rather than a refusal: the arithmetic is sound, and the
    // user may know something about their case that the form does not.
    const source = macros();

    expect(source).toContain("plan.fatBelowFloor");
    expect(source).toContain('t("fatFloor"');
    expect(source).toContain("FAT_FLOOR_PERCENT");
    expect(ptBR.Macros.fatFloor).toContain("{share}");
    expect(ptBR.Macros.fatFloor).toContain("{floor, number}");
  });

  it("quotes the real bounds in the hints and the range messages", () => {
    const source = macros();

    expect(source).toContain('t("coefficientHint", MACRO_GOAL_LIMITS.proteinGPerKg)');
    expect(source).toContain("adjustmentLimits(adjustmentUnit)");

    for (const message of [
      ptBR.Macros.coefficientHint,
      ptBR.Macros.errors.kcalRange,
      ptBR.Macros.errors.percentRange,
      ptBR.Macros.errors.proteinRange,
      ptBR.Macros.errors.fatPercentRange,
      ptBR.Macros.errors.fatKcalRange,
    ]) {
      expect(message).toContain("{min, number}");
      expect(message).toContain("{max, number}");
    }
  });

  it("prices each macro with its own Atwater factor", () => {
    // Not `4`, `4` and `9` written into the table. The constants are pinned in
    // macros.test.ts, and a second copy here is a second place for the fat
    // factor to become a 4 in a screen nobody recomputes by hand.
    const source = macros();

    expect(source).toContain("ATWATER.proteinKcalPerG");
    expect(source).toContain("ATWATER.carbKcalPerG");
    expect(source).toContain("ATWATER.fatKcalPerG");
  });

  it("writes the sum out only when there is an adjustment in it", () => {
    // Maintenance is not "gasto +0 = gasto". Zero is the one adjustment with no
    // arithmetic to show, and printing it as a term makes the target look like
    // it is waiting for a number that never came.
    const source = macros();

    expect(source).toContain("plan.adjustmentKcal === 0");
    expect(source).toContain('t("targetSame")');
    expect(source).toContain('t("targetEquation"');
    expect(ptBR.Macros.targetSame).not.toContain("{");
  });

  it("shows what the grams add up to next to what was asked for", () => {
    // The reconciliation. Two numbers, both printed: the sum is computed from
    // the rounded grams (`plan.targets.kcal`), never copied from the target, so
    // the line is a check rather than a restatement.
    const source = macros();

    expect(source).toContain('t("reconcile"');
    expect(source).toContain("sum: kcal(plan.targets.kcal)");
    expect(source).toContain("target: kcal(plan.targetKcal)");
    expect(ptBR.Macros.reconcile).toContain("{sum}");
    expect(ptBR.Macros.reconcile).toContain("{target}");
  });

  it("shows the rounding drift rather than hiding it", () => {
    const source = macros();

    expect(source).toContain("plan.driftKcal");
    expect(source).toContain('t("drift"');
    expect(source).toContain('t("driftNone")');
    expect(ptBR.Macros.drift).toContain("{drift}");
    // Signed, because a target three kilocalories over and one three under are
    // different facts and "3 kcal" alone does not say which happened.
    expect(source).toContain('signDisplay: "always"');
  });

  it("says so when protein and fat alone overshoot the target", () => {
    // Carbohydrate floors at zero in `planMacros`, and a plan whose protein and
    // fat already cost more than the target would otherwise print as a tidy
    // zero-carb split with no sign that it does not add up.
    const source = macros();

    expect(source).toContain("plan.carbShortfallKcal > 0");
    expect(source).toContain('t("shortfall"');
    expect(ptBR.Macros.shortfall).toContain("{excess}");
  });

  it("does not blame rounding for a gap rounding cannot explain", () => {
    // Both messages rendering at once is what this prevents: 4 g/kg of protein
    // with 60% of the target from fat under a deficit printed "+683 kcal"
    // directly above "at most 8 kcal", which reads as a broken sum rather than
    // as a goal that cannot be met.
    const source = macros();

    expect(source).toContain("plan.carbShortfallKcal > 0 ? (");
    expect(source).not.toContain("plan.carbShortfallKcal > 0 && (");
    expect(
      source.indexOf('t("drift"'),
      "the rounding note is not the shortfall's alternative branch",
    ).toBeGreaterThan(source.indexOf("plan.carbShortfallKcal > 0 ? ("));
  });

  it("stands on the expenditure it was divided from", () => {
    // Same screen, not a page of its own: grams are meaningless without the
    // TDEE above them, and the weight the protein coefficient multiplied is
    // named.
    expect(read("src/components/EnergyResult.tsx")).toContain(
      "<MacroTargets summary={summary} />",
    );
    expect(macros()).toContain('t("basis"');
    expect(ptBR.Macros.basis).toContain("{weight}");
  });

  it("reaches the device store only through the repository seam", () => {
    // The goal is personal data. It stays on the device for the same reason the
    // profile does (#5), and there is no server call anywhere in this section.
    const source = macros();

    expect(source).toContain("getRepository()");
    expect(source).not.toContain("lib/storage/dexie");
    expect(source).not.toContain('from "dexie"');
    expect(source).not.toContain("fetch(");
  });
});
