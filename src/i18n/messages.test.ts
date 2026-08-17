import { describe, expect, it } from "vitest";

import { messages } from "./messages";
import { routing } from "./routing";

/** Flattens `{a: {b: "x"}}` to `["a.b"]`. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

function leafValues(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [value];
  return Object.values(value).flatMap(leafValues);
}

describe("message catalogues", () => {
  it("has a catalogue for every configured locale", () => {
    for (const locale of routing.locales) {
      expect(messages[locale], `missing catalogue for ${locale}`).toBeDefined();
    }
  });

  it("has no catalogue for a locale that is not configured", () => {
    expect(Object.keys(messages).sort()).toEqual([...routing.locales].sort());
  });

  // Trivially true while pt-BR is alone. It is here so that the day a second
  // catalogue lands, a missed key fails the build instead of rendering the raw
  // key path to a user.
  it("keeps every catalogue on the same key set as the default locale", () => {
    const reference = keyPaths(messages[routing.defaultLocale]).sort();

    for (const locale of routing.locales) {
      expect(keyPaths(messages[locale]).sort(), `key drift in ${locale}`).toEqual(
        reference,
      );
    }
  });

  it("contains no empty or placeholder values", () => {
    for (const locale of routing.locales) {
      for (const value of leafValues(messages[locale])) {
        expect(typeof value).toBe("string");
        expect((value as string).trim(), `empty value in ${locale}`).not.toBe("");
        expect((value as string), `untranslated TODO in ${locale}`).not.toMatch(
          /^TODO/i,
        );
      }
    }
  });
});
