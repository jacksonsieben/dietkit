/**
 * The app's top-level destinations (#61).
 *
 * Sixteen routes reached only by a wall of links on the first screen is the
 * complaint this replaces. What the routes actually are is five things — the
 * day, the food, the training, the body, and everything that is settings — and
 * the bar below names those five rather than the sixteen.
 *
 * `training` held its seat here, unlit and inert, from the day the bar was
 * built: it is a peer of the diet rather than a page under it (PRODUCT.md,
 * Capabilities), and a bar built for four would have moved every tab under the
 * user's thumb the week the fifth landed. #78 filled it, and filling it was
 * one line — which was the point of holding it.
 */

export const TAB_IDS = ["today", "diet", "training", "weight", "more"] as const;

export type TabId = (typeof TAB_IDS)[number];

export interface Tab {
  id: TabId;
  href: string;
  /**
   * Extra route prefixes this tab owns. The food screens are the diet's
   * material, not a sixth destination: someone looking up a food is in the
   * middle of building a plan, and sending them to a tab of their own is what
   * made the old first screen a list of everything.
   */
  owns?: readonly string[];
}

export const TABS: readonly Tab[] = [
  { id: "today", href: "/" },
  { id: "diet", href: "/dieta", owns: ["/alimentos"] },
  { id: "training", href: "/treino" },
  { id: "weight", href: "/peso" },
  { id: "more", href: "/mais" },
];

/**
 * Which tab a path belongs to.
 *
 * `more` is the fallback rather than a list, so a route added later is filed
 * somewhere real instead of leaving the bar with nothing lit — a nav that goes
 * blank on an unexpected path is how a user loses track of where they are.
 */
export function activeTab(pathname: string): TabId {
  const path = normalise(pathname);
  if (path === "/") return "today";

  for (const tab of TABS) {
    if (tab.href !== "/" && under(path, tab.href)) return tab.id;
    if (tab.owns?.some((prefix) => under(path, prefix))) return tab.id;
  }

  return "more";
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Tolerates the trailing slash a share sheet or a typed URL can carry in. */
function normalise(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Which name goes on the plate at the top of a given route.
 *
 * The plate exists because of the first finding in the UI review: sixteen
 * routes and no wayfinding, so a screen reached from a link and a screen
 * reached from the tab bar looked identical and neither said where it was.
 * Every route therefore names itself, in the same dot-matrix face, in the same
 * position — the one piece of chrome that is never absent.
 *
 * Longest prefix wins, so `/alimentos/meus` gets its own plate rather than
 * inheriting the one from `/alimentos`. Anything unmapped falls back to the
 * app's own name, which is honest: a route with no plate of its own is a route
 * this table has not been told about yet, and printing the wrong screen's name
 * would be worse than printing none.
 */
export const PLATES: Readonly<Record<string, string>> = {
  "/": "today",
  "/dieta": "diet",
  "/dieta/modelos": "presets",
  "/treino": "training",
  "/treino/historico": "trainingHistory",
  "/peso": "weight",
  "/mais": "more",
  "/alimentos": "foods",
  "/alimentos/meus": "myFoods",
  "/alimentos/grupos": "groups",
  "/perfil": "profile",
  "/energia": "energy",
  "/backup": "backup",
  "/importar": "import",
  "/fontes": "sources",
  "/privacidade": "privacy",
  "/termos": "terms",
  "/saude": "health",
  "/~offline": "offline",
};

export function plateKey(pathname: string): string | undefined {
  const path = normalise(pathname);

  let best: string | undefined;
  for (const prefix of Object.keys(PLATES)) {
    if (!under(path, prefix)) continue;
    if (best === undefined || prefix.length > best.length) best = prefix;
  }

  return best === undefined ? undefined : PLATES[best];
}
