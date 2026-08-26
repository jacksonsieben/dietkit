import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

/**
 * The app stays completely usable signed out — #29, #93.
 *
 * An account is for moving data between devices. It is not the price of using
 * the app, and local-only is not a degraded mode: it is the default, and it is
 * what every screen was built against. The risk is not that somebody decides to
 * put a login wall up; it is that a guard gets added to one route "for now",
 * and then the next route copies it.
 *
 * So the rule is structural rather than behavioural. Nothing outside the
 * account screens may so much as *import* the auth module — a screen that
 * cannot ask whether a session exists cannot behave differently when one does
 * not (docs/DECISIONS.md § D23). That is checkable by reading imports, which is
 * the only thing that stays true as screens are added by someone who has not
 * read this comment.
 */

/** Where the Neon Auth SDK is wrapped. Nothing else may reach past this. */
const AUTH_MODULE = "src/lib/auth";

/** The same module as everything else in `src` spells it. */
const AUTH_ALIAS = AUTH_MODULE.replace(/^src\//, "@/");

/**
 * The only places allowed to know whether somebody is signed in.
 *
 * Every entry is a screen whose subject *is* the account. To add one you have
 * to come here and write down why the thing you are building stops working
 * without an account — which, for anything about a diet or a weight or a set,
 * it does not.
 */
const MAY_IMPORT_AUTH = [
  AUTH_MODULE, // The wrapper itself.
  "src/app/[locale]/conta", // Sign in, sign out, "signed in as ___", delete.
  "src/app/api/auth", // The route handler Neon Auth proxies through.
  // Sync (#95). The only route here whose subject really is the account: it
  // reads the account id from the session and hands it to the store, because
  // that is the entire boundary between one person's sealed rows and another's
  // — and there is nothing for it to do for somebody who has not got one. Every
  // screen that *writes* those rows still knows nothing about any of it: the
  // decorator in src/lib/sync/repository.ts takes a transport, and the app runs
  // signed out with no transport at all.
  "src/app/api/sync",
];

/** The route a guard would send somebody to. Named here so it can be looked for. */
const SIGN_IN_PATH = "/conta/entrar";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function sourceFiles(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];

  const found: string[] = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...sourceFiles(relative));
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      found.push(relative);
    }
  }

  return found;
}

/**
 * Tests are excluded from both walls below.
 *
 * Not a loophole: a test cannot put a guard in front of a screen. Both of them
 * name paths and modules in order to check them -- this file names the sign-in
 * route so it can look for it, and the craft census names every screen file so
 * it can count them -- and a rule that fires on the file enforcing it is a rule
 * that gets deleted rather than obeyed.
 */
function isTest(file: string): boolean {
  return file.endsWith(".test.ts") || file.endsWith(".test.tsx");
}

/** Path comparison in POSIX form, so this reads the same on either platform. */
function posix(file: string): string {
  return file.split(path.sep).join("/");
}

/** So that a `/` or a `.` in the module name cannot mean anything else. */
function escaped(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function importsAuth(file: string): boolean {
  const contents = fs.readFileSync(path.join(ROOT, file), "utf8");

  // `@/lib/auth` and `@/lib/auth/server`, but not `@/lib/authors`.
  const reach = new RegExp(
    `from\\s+["']${escaped(AUTH_ALIAS)}(?:/[^"']*)?["']`,
  );

  return reach.test(contents);
}

describe("an account is optional", () => {
  it("puts no guard in the proxy, where a guard would cover everything", () => {
    // `proxy.ts` is Next 16's middleware. It is the one file that can redirect
    // every route at once, so it is the one file where a login wall would be a
    // three-line change nobody would notice in a diff.
    const proxy = fs.readFileSync(path.join(ROOT, "src/proxy.ts"), "utf8");

    expect(proxy).not.toContain(AUTH_ALIAS);
    expect(proxy).not.toContain("auth.middleware");
    expect(proxy).not.toContain(SIGN_IN_PATH);
  });

  it("lets nothing but the account screens import the auth module", () => {
    const trespassers = sourceFiles("src")
      .filter((file) => !isTest(file))
      .filter((file) =>
        MAY_IMPORT_AUTH.every((allowed) => !posix(file).startsWith(allowed)),
      )
      .filter(importsAuth)
      .map(posix)
      .sort();

    expect(trespassers).toEqual([]);
  });

  it("sends nobody to a sign-in screen from a screen that is not about accounts", () => {
    // The other shape of the same mistake: not an import, but a bare redirect.
    const offenders = sourceFiles("src")
      .filter((file) => !isTest(file))
      .filter((file) =>
        MAY_IMPORT_AUTH.every((allowed) => !posix(file).startsWith(allowed)),
      )
      .filter((file) =>
        fs.readFileSync(path.join(ROOT, file), "utf8").includes(SIGN_IN_PATH),
      )
      .map(posix)
      .sort();

    expect(offenders).toEqual([]);
  });

  it("keeps the auth module out of the storage layer entirely", () => {
    // Storage is where a "sync only if signed in" shortcut would land, and it
    // is the layer every screen already depends on — so an account leaking in
    // here would reach the whole app in one commit (docs/DECISIONS.md § D1).
    const offenders = sourceFiles("src/lib/storage")
      .filter(importsAuth)
      .map(posix);

    expect(offenders).toEqual([]);
  });
});
