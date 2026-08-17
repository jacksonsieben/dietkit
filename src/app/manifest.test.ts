import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import manifest from "./manifest";

const PUBLIC_DIR = path.resolve(import.meta.dirname, "../../public");

/** Width and height out of a PNG's IHDR, which is always the first chunk. */
function pngSize(file: string) {
  const header = Buffer.alloc(24);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, header, 0, 24, 0);
  } finally {
    fs.closeSync(fd);
  }

  expect(header.subarray(1, 4).toString("ascii")).toBe("PNG");
  return `${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  it("names icons that exist, at the size it claims", () => {
    // A manifest icon is fetched by the install dialog, not by a page, so a
    // wrong path or a resized file produces no error anywhere a person would
    // see it — the install just quietly falls back to a screenshot of the
    // favicon.
    const { icons } = manifest();
    expect(icons?.length).toBeGreaterThan(0);

    for (const icon of icons ?? []) {
      const file = path.join(PUBLIC_DIR, String(icon.src));

      expect(fs.existsSync(file), `${icon.src} is missing from public/`).toBe(
        true,
      );
      expect(pngSize(file)).toBe(icon.sizes);
    }
  });

  it("ships a maskable icon as well as a plain one", () => {
    // Android crops every icon to the launcher's own shape. Without a maskable
    // entry the mark gets cut into, and with only a maskable entry every other
    // surface shows a mark padded for a crop that never happens.
    const purposes = (manifest().icons ?? []).map((icon) => icon.purpose);

    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });

  it("starts inside its own scope", () => {
    // A start_url outside scope launches the installed app straight into the
    // browser instead of its own window.
    const { start_url: startUrl, scope, id } = manifest();

    expect(startUrl).toBeDefined();
    expect(scope).toBeDefined();
    expect(startUrl?.startsWith(scope!)).toBe(true);
    // Pinned so moving start_url later does not read as a different app.
    expect(id).toBe("/");
  });

  it("is named in the locale the app ships in", () => {
    // The manifest lives outside `[locale]`, so nothing about the request tells
    // it which catalogue to read — it has to ask. If that wiring breaks it
    // fails open, with raw message keys on the home screen.
    const { name, short_name: shortName, lang } = manifest();

    expect(lang).toBe("pt-BR");
    expect(shortName).toBe("DietKit");
    expect(name).toContain("DietKit");
    expect(name).not.toContain("Manifest.");
  });
});
