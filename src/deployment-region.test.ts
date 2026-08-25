import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * The functions run where the database is — docs/DECISIONS.md § D22.
 *
 * Vercel's default function region is `iad1`, Washington DC, and production ran
 * there for months while Neon sat in `eu-central-1`. Every food search went
 * Paris → Virginia → Frankfurt → Virginia → Paris: a few hundred milliseconds
 * of pure geography, and an undisclosed trip across the Atlantic on the one
 * server call this app makes. With accounts on top (#29) the same detour would
 * carry session cookies, reset tokens and the email address itself.
 *
 * The dashboard setting alone would not survive a project re-link and is not
 * reviewable in a diff, so the choice is checked in — `vercel.json` `regions`
 * overrides Project Settings — and asserted here, because the failure mode is
 * silent. Nothing goes red when a function drifts back to Virginia; the app
 * just gets slower and the privacy notice quietly stops being true.
 */
const CONFIG = "vercel.json";

/**
 * Vercel regions inside the EU/EEA.
 *
 * The list is deliberately not "Europe". `lhr1` is London: adequate under the
 * UK's own GDPR adequacy decision, but not EU/EEA — and it is EU/EEA that
 * Resolution CD/ANPD nº 32/2026 recognised as adequate, which is what lets
 * Brazilian users be served from Frankfurt on LGPD art. 33, I with no clauses
 * to sign. A move to London would be a transfer decision, not a config tweak.
 */
const EEA_REGIONS = new Set([
  "arn1", // Stockholm
  "cdg1", // Paris
  "dub1", // Dublin
  "fra1", // Frankfurt
]);

/** Where the Neon database lives. Co-location is the entire point. */
const DATABASE_REGION = "fra1";

type VercelConfig = {
  regions?: string[];
  functionFailoverRegions?: string[];
  functions?: Record<
    string,
    { regions?: string[]; functionFailoverRegions?: string[] }
  >;
};

function config(): VercelConfig {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, CONFIG), "utf8"),
  ) as VercelConfig;
}

describe("the functions run next to the database", () => {
  it("pins the project to the region Neon is in", () => {
    expect(config().regions).toEqual([DATABASE_REGION]);
  });

  it("pins exactly one region", () => {
    // Hobby allows a single region, so a second entry would fail the deploy
    // rather than the build. Better to hear it here — and a multi-region app
    // reading one Frankfurt database is a slower app, not a faster one.
    expect(config().regions).toHaveLength(1);
  });

  it("cannot execute outside the EEA, including on failover", () => {
    // `functionFailoverRegions` is the hole this closes: a fallback to `iad1`
    // would put the US trip back, at the worst possible moment, without any
    // change to `regions` at all. Per-function overrides are the same hole
    // one level down.
    const { regions, functionFailoverRegions, functions } = config();

    const declared = [
      ...(regions ?? []),
      ...(functionFailoverRegions ?? []),
      ...Object.values(functions ?? {}).flatMap((fn) => [
        ...(fn.regions ?? []),
        ...(fn.functionFailoverRegions ?? []),
      ]),
    ];

    expect(declared.filter((region) => !EEA_REGIONS.has(region))).toEqual([]);
  });
});
