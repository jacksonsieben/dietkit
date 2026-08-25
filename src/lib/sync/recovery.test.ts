import { describe, expect, it } from "vitest";

import { generateRecoveryCode, normalizeRecoveryCode } from "./recovery";

/**
 * Two properties, pulling against each other: the code has to be strong enough
 * that guessing it is not a plan, and readable enough that a person copying it
 * off paper a year from now gets it right. Both are tested, because relaxing
 * either one quietly is easy.
 */

describe("generating a recovery code", () => {
  it("is five groups of five, which is how anybody copies a key", () => {
    expect(generateRecoveryCode()).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  });

  it("never contains a character that gets misread", () => {
    // I and L for 1, O for 0, and U so that no code spells anything.
    const drawn = Array.from({ length: 200 }, () => generateRecoveryCode());

    expect(drawn.join("")).not.toMatch(/[ILOU]/);
  });

  it("does not repeat itself", () => {
    // 125 bits: a collision here means the random source is broken, not unlucky.
    const drawn = new Set(
      Array.from({ length: 500 }, () => generateRecoveryCode()),
    );

    expect(drawn.size).toBe(500);
  });

  it("uses the whole alphabet, rather than a corner of it", () => {
    // Catches a masking mistake that would quietly cost most of the entropy.
    const symbols = new Set(
      Array.from({ length: 500 }, () => generateRecoveryCode())
        .join("")
        .replaceAll("-", ""),
    );

    expect(symbols.size).toBe(32);
  });
});

describe("reading a recovery code back", () => {
  it("accepts the code exactly as it was printed", () => {
    const code = generateRecoveryCode();

    expect(normalizeRecoveryCode(code)).toBe(code.replaceAll("-", ""));
  });

  it("accepts it however it was typed", () => {
    const printed = "4TQ9K-M0XZW-B7HGF-2VNPR-S3DCJ";
    const expected = "4TQ9KM0XZWB7HGF2VNPRS3DCJ";

    expect(normalizeRecoveryCode(printed.toLowerCase())).toBe(expected);
    expect(normalizeRecoveryCode(printed.replaceAll("-", " "))).toBe(expected);
    expect(normalizeRecoveryCode(printed.replaceAll("-", ""))).toBe(expected);
    expect(normalizeRecoveryCode(`  ${printed}\n`)).toBe(expected);
  });

  it("reads the letters a hand would have written", () => {
    // The person wrote a 1 and read back an l. Refusing that would be correct
    // and would cost them everything they have logged.
    expect(normalizeRecoveryCode("4TQ9K-MOXZW-B7HGF-ZVNPR-S3DCJ")).toBe(
      normalizeRecoveryCode("4TQ9K-M0XZW-B7HGF-ZVNPR-S3DCJ"),
    );
    expect(normalizeRecoveryCode("4TQ9K-MIXZW-B7HGF-ZVNPR-S3DCJ")).toBe(
      normalizeRecoveryCode("4TQ9K-M1XZW-B7HGF-ZVNPR-S3DCJ"),
    );
    expect(normalizeRecoveryCode("4TQ9K-MLXZW-B7HGF-ZVNPR-S3DCJ")).toBe(
      normalizeRecoveryCode("4TQ9K-M1XZW-B7HGF-ZVNPR-S3DCJ"),
    );
  });

  it("says no when it is not a code at all", () => {
    // `null` is "that is not the right shape", which a screen may say out loud.
    // It is not "wrong code" — only a failed unwrap knows that.
    expect(normalizeRecoveryCode("")).toBeNull();
    expect(normalizeRecoveryCode("4TQ9K-M0XZW-B7HGF-2VNPR")).toBeNull();
    expect(
      normalizeRecoveryCode("4TQ9K-M0XZW-B7HGF-2VNPR-S3DCJ-EXTRA"),
    ).toBeNull();
    expect(normalizeRecoveryCode("4TQ9K-M0XZW-B7HGF-2VNPR-S3DCU")).toBeNull();
    expect(normalizeRecoveryCode("4TQ9K M0XZW B7HGF 2VNPR S3DC!")).toBeNull();
  });
});
