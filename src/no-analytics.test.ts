import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * DietKit measures nobody — docs/DECISIONS.md § D9.
 *
 * The claim the whole architecture rests on is "your data never leaves this
 * device", and an analytics tag would make that false in the most ordinary way
 * imaginable: not by leaking a diet, but by shipping a request to a third party
 * on every page view. Cookieless does not rescue it. The vendors that market
 * themselves that way still derive a visitor identifier by hashing IP and user
 * agent, and under the LGPD a pseudonymous identifier is still a personal
 * datum — the obligations come back, and the sentence in the privacy notice
 * stops being true.
 *
 * So this is checked rather than merely written down. ESLint's
 * `no-restricted-imports` blocks the imports; this file covers the two ways
 * around it a linter cannot see — an inline <script>, and the dependency
 * appearing in package.json in the first place.
 */

/** Directories holding code that ships or runs. */
const SCANNED = ["src", "scripts"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);

/**
 * Signatures of the tags themselves, not of the packages. These are what an
 * inline snippet pasted from a vendor's "installation" page actually contains.
 */
const TAG_SIGNATURES = [
  "googletagmanager.com",
  "google-analytics.com",
  "gtag(",
  "dataLayer.push",
  "connect.facebook.net",
  "fbq(",
  "static.hotjar.com",
  "clarity.ms",
  "cdn.segment.com",
  "plausible.io",
  "posthog.com",
  "mixpanel.com",
  "amplitude.com",
  "/_vercel/insights",
  "/_vercel/speed-insights",
];

/** Packages whose only purpose is to measure the people using the app. */
const ANALYTICS_PACKAGES = [
  "@vercel/analytics",
  "@vercel/speed-insights",
  "posthog-js",
  "mixpanel-browser",
  "plausible-tracker",
  "react-ga",
  "react-ga4",
  "analytics",
];
const ANALYTICS_SCOPES = ["@amplitude/", "@segment/", "@umami/"];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(path.join(ROOT, dir), {
    withFileTypes: true,
  })) {
    const relative = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(relative));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(relative);
    }
  }

  return found;
}

describe("no analytics, anywhere", () => {
  it("has no tracking tag in any file that ships", () => {
    const offenders: string[] = [];

    for (const file of SCANNED.flatMap(sourceFiles)) {
      // This file names every signature it looks for, which is exactly the
      // string it would otherwise flag itself on.
      if (file === path.join("src", "no-analytics.test.ts")) continue;

      const contents = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const signature of TAG_SIGNATURES) {
        if (contents.includes(signature)) {
          offenders.push(`${file} contains ${signature}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("depends on no analytics package", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // devDependencies count. A tag added "just for staging" is still a tag, and
    // the build that produces the deployed bundle installs both.
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];

    const offenders = declared.filter(
      (name) =>
        ANALYTICS_PACKAGES.includes(name) ||
        ANALYTICS_SCOPES.some((scope) => name.startsWith(scope)),
    );

    expect(offenders).toEqual([]);
  });

  it("loads no third-party script from the app shell", () => {
    // Self-hosted fonts and the service worker are the only scripts the app
    // brings in by hand. Anything else pointing off-origin from the layout is
    // a request made on the user's behalf to somebody they did not choose.
    const layout = fs.readFileSync(
      path.join(ROOT, "src/app/[locale]/layout.tsx"),
      "utf8",
    );

    expect(layout).not.toContain("<script");
    expect(layout).not.toContain("next/script");
  });
});
