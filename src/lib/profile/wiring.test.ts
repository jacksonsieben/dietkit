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
