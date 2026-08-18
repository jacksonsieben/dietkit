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
  });

  it("offers the ladder as a choice rather than a number to type", () => {
    // Nobody knows their own multiplier. 1,55 is not a fact anyone has about
    // themselves, and a free text field asking for one collects guesses.
    const form = read("src/components/ProfileForm.tsx");
    const field = form.slice(form.indexOf('label={t("activityLabel")}'));

    expect(field).toContain("<select");
    expect(field).toContain("ACTIVITY_LEVELS.map");
    // The escape hatch for a stored value between two rungs — an import (#26),
    // or #14's override. Dropping it silently rewrites the user's number.
    expect(field).toContain("{offLadder && (");
    expect(field.slice(0, field.indexOf("</Field>"))).not.toContain('inputMode="decimal"');
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

  it("precaches /perfil so it opens with no network", () => {
    // "Works offline" in #12's done-when. Without an entry here a cold start
    // with no connection serves the /~offline fallback instead of the form,
    // even though everything the form displays is already on the device.
    expect(read("serwist.config.mjs")).toContain('{ url: "/perfil", revision }');
  });

  it("is reachable from the home page", () => {
    expect(read("src/app/[locale]/page.tsx")).toContain('href="/perfil"');
  });

  it("puts the health notice beside the body-metrics input", () => {
    // The follow-up docs/DECISIONS.md § D10 left open when #10 shipped: the
    // footer link is easy to walk past, and this is the screen where the
    // estimate actually gets made.
    expect(read("src/components/ProfileForm.tsx")).toContain('href="/saude"');
  });
});
