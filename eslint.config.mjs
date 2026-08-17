import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
          ],
        },
      ],
    },
  },
  {
    // ...except the adapter itself, which is the one file allowed to.
    files: ["src/lib/storage/dexie/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
