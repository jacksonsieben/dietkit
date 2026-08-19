import { describe, expect, it } from "vitest";

import { PREDECESSOR_EXPORT } from "./export.fixture";
import { IGNORED_KEYS, OPTIONAL_KEYS, parseProfile, parseProfileFile } from "./profile";

/** The fixture, with `edit` applied — deletions written as `undefined`. */
function exported(edit: Record<string, unknown> = {}) {
  const file: Record<string, unknown> = { ...PREDECESSOR_EXPORT, ...edit };
  for (const [key, value] of Object.entries(edit)) {
    if (value === undefined) delete file[key];
  }
  return file;
}

const codes = (result: ReturnType<typeof parseProfile>) =>
  result.ok ? [] : result.issues.map((issue) => `${issue.code}:${issue.key}`);

describe("parseProfile", () => {
  it("reads an export the predecessor actually wrote", () => {
    const result = parseProfile(exported());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.weightKg).toBe(82.5);
    expect(result.value.heightCm).toBe(178);
    expect(result.value.age).toBe(34);
    expect(result.value.sexLabel).toBe("Masculino");
    expect(result.value.activityIdx).toBe(2);
    // Signed in the file: the predecessor stores the direction in the number.
    expect(result.value.kcalAdjustment).toBe(-500);
    expect(result.value.coeffProtein).toBe(2.2);
    expect(result.value.coeffCarb).toBe(3.4);
    expect(result.value.coeffFat).toBe(0.9);
  });

  it("keeps the two day types apart", () => {
    // `dist_treino_carb_*` and `dist_descanso_carb_*` are different plans for
    // different days. Reading one into both is the kind of mistake that makes
    // an import look right and be wrong.
    const result = parseProfile(
      exported({ dist_descanso_carb_0: 12, dist_treino_carb_0: 20 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.distribution.treino.carb[0]).toBe(20);
    expect(result.value.distribution.descanso.carb[0]).toBe(12);
  });

  it("reads the selections as indices, in meal order", () => {
    // These are the keys with no meaning of their own — they point into option
    // lists in the catalogue — so meal order is all they carry.
    const result = parseProfile(exported());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.selection.treino.carb).toEqual([1, 0, 0, 0]);
    expect(result.value.selection.treino.prot).toEqual([0, 2, 0, 0]);
    expect(result.value.selection.descanso.carb).toEqual([0, 0, 0, 3]);
    expect(result.value.descansoCarbCut).toEqual([0, 15, 0, 0]);
  });

  it("refuses a required key instead of filling it in", () => {
    // The predecessor's loader merged over its factory profile and said
    // nothing, so a damaged file came back as a plausible plan for a 70 kg
    // stranger. Its own validator calls this an error, and so does this.
    expect(codes(parseProfile(exported({ weight_kg: undefined })))).toContain(
      "missing:weight_kg",
    );
    expect(
      codes(parseProfile(exported({ dist_treino_fat_2: undefined }))),
    ).toContain("missing:dist_treino_fat_2");
    expect(
      codes(parseProfile(exported({ sel_descanso_prot_0: undefined }))),
    ).toContain("missing:sel_descanso_prot_0");
  });

  it("opens an export written before the custom activity factor existed", () => {
    // Those two keys are optional in the predecessor, so a file without them is
    // old rather than broken — but the import screen still gets to say which
    // assumption it made.
    const edit = Object.fromEntries(OPTIONAL_KEYS.map((key) => [key, undefined]));
    const result = parseProfile(exported(edit));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect([...result.defaulted].sort()).toEqual([...OPTIONAL_KEYS].sort());
    expect(result.value.useCustomFa).toBe(false);
  });

  it("does not require a setting it would ignore anyway", () => {
    // `pdf_layout` picks a layout for the predecessor's PDF. Rejecting a file
    // for lacking it would be strictness with nothing behind it.
    for (const key of IGNORED_KEYS) {
      expect(parseProfile(exported({ [key]: undefined })).ok).toBe(true);
    }
  });

  it("refuses a number the predecessor would have refused", () => {
    expect(codes(parseProfile(exported({ dist_treino_carb_0: 140 })))).toContain(
      "outOfRange:dist_treino_carb_0",
    );
    // Rest-day carbohydrate is *cut*, never doubled: the old app caps it at 50.
    expect(codes(parseProfile(exported({ descanso_carb_cut_2: 80 })))).toContain(
      "outOfRange:descanso_carb_cut_2",
    );
    expect(codes(parseProfile(exported({ sel_treino_carb_1: -1 })))).toContain(
      "outOfRange:sel_treino_carb_1",
    );
  });

  it("refuses a number written as text rather than guessing at it", () => {
    // "82,5" is a plausible thing to find in a hand-edited file and there is no
    // safe reading of it — a comma is a decimal point in pt-BR and a thousands
    // separator elsewhere.
    expect(codes(parseProfile(exported({ weight_kg: "82,5" })))).toContain(
      "wrongType:weight_kg",
    );
    // And "178", which `Number()` would take without complaint — a string that
    // parses is the one that gets coerced by accident.
    expect(codes(parseProfile(exported({ height_cm: "178" })))).toContain(
      "wrongType:height_cm",
    );
    expect(codes(parseProfile(exported({ sex_label: 1 })))).toContain(
      "wrongType:sex_label",
    );
    expect(codes(parseProfile(exported({ use_custom_fa: "sim" })))).toContain(
      "wrongType:use_custom_fa",
    );
  });

  it("refuses anything that is not one profile object", () => {
    for (const input of [null, [PREDECESSOR_EXPORT], "texto", 42]) {
      expect(codes(parseProfile(input))).toEqual(["notAnObject:"]);
    }
  });
});

describe("parseProfileFile", () => {
  it("reads the text a file input hands over", () => {
    expect(parseProfileFile(JSON.stringify(PREDECESSOR_EXPORT)).ok).toBe(true);
  });

  it("says so when the file is not JSON at all", () => {
    // The likeliest wrong file is the predecessor's *PDF*, which is the other
    // thing it exports.
    expect(codes(parseProfileFile("%PDF-1.4"))).toEqual(["notAnObject:"]);
  });
});
