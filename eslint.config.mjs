import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * DietKit measures nobody (#11, docs/DECISIONS.md § D9).
 *
 * Cookieless is not the bar. A daily hash of IP and user agent is still a
 * personal datum under the LGPD, so the "cookieless" vendors re-create the
 * obligations the whole architecture exists to avoid — and one exception is
 * all it takes for "we collect nothing" to stop being true.
 *
 * Applied in every config block below that sets `no-restricted-imports`, since
 * ESLint replaces a rule's options rather than merging them. The companion
 * check in src/no-analytics.test.ts catches the half a linter cannot see: a
 * raw <script> tag, or the dependency arriving in package.json.
 */
const noAnalytics = {
  group: [
    "@vercel/analytics",
    "@vercel/analytics/*",
    "@vercel/speed-insights",
    "@vercel/speed-insights/*",
    "next/third-parties",
    "next/third-parties/*",
    "posthog-js",
    "posthog-js/*",
    "mixpanel-browser",
    "@amplitude/*",
    "@segment/*",
    "analytics",
    "react-ga",
    "react-ga4",
    "plausible-tracker",
    "@umami/*",
  ],
  message:
    "DietKit ships no analytics of any kind — see docs/DECISIONS.md § D9. This is a launch condition, not a preference.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    // Every user-facing string comes from `messages/`, not from a component —
    // docs/DECISIONS.md § D5. This catches the JSX-text half; the typed
    // `Messages` interface in src/types/next-intl.d.ts catches bad keys.
    files: ["src/**/*.tsx"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: true,
          ignoreProps: true,
          allowedStrings: ["·", "—", "–", "/", "%", "+", "−", ":", "×"],
        },
      ],
    },
  },

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // `const { id: _id, ...rest } = row` is how you omit a field in TS.
      // Without this the deliberately-discarded key reads as a dead variable.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },

  {
    // The storage seam (#5). Nothing above `src/lib/storage` may know which
    // engine is underneath, or the "swap in a sync backend later" plan quietly
    // stops being true — one `db.table.get()` in a component is all it takes.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "dexie",
              message:
                "Import from @/lib/storage instead. Dexie is confined to src/lib/storage/dexie/.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/storage/dexie", "@/lib/storage/dexie/*"],
              message:
                "Use getRepository() from @/lib/storage rather than reaching for the IndexedDB adapter.",
            },
            // The other half of the same boundary (#2). Personal data may not
            // leave the device, and reference data may not leave the server —
            // one `drizzle-orm` import in a client component is how a database
            // driver ends up in the browser bundle and how a query for
            // somebody's diet ends up looking reasonable.
            {
              group: ["drizzle-orm", "drizzle-orm/*", "@neondatabase/serverless"],
              message:
                "Query from src/lib/db/ and pass plain data outward. The database is reference data only — see docs/DECISIONS.md § D1.",
            },
            noAnalytics,
          ],
        },
      ],
    },
  },
  {
    // ...except the two adapters themselves, which are the files allowed to.
    // The analytics ban is not part of that exemption and is restated here:
    // ESLint replaces a rule's options wholesale rather than merging them, so
    // a bare "off" would have quietly opened the one hole nothing else covers.
    files: ["src/lib/storage/dexie/**/*.ts", "src/lib/db/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noAnalytics] }],
    },
  },
  {
    // ...and except tests, which are allowed to build a real adapter to run the
    // code under test against. The point of the seam is that *shipped* code
    // does not know which store it is talking to; a test that stands one up on
    // fake-indexeddb is checking the seam holds, not going around it. The
    // alternative is a mock that agrees with whatever the implementation does,
    // which is how "persisted through the Repository interface" (#12) becomes a
    // claim nothing verifies.
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noAnalytics] }],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Build output, like `.next/**` — `serwist build` compiles src/sw.ts into
    // it. Linting a bundle only ever reports on somebody else's minified code.
    "public/sw.js",
    "public/sw.js.map",
  ]),
]);

export default eslintConfig;
