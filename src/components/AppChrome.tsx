"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { DotIcon, DotText } from "@/components/dot/DotText";
import { Link, usePathname } from "@/i18n/navigation";
import { activeTab, plateKey, TABS, type TabId } from "@/lib/nav/tabs";

/**
 * The frame every screen sits in: a name plate above, five slots below.
 *
 * The UI review's first finding was that this app had sixteen routes and no
 * map — the home screen was a heap of links, and once you followed one there
 * was nothing on screen saying where you had landed or how to get anywhere
 * else. Installed as a PWA there is not even a browser back button to fall
 * back on. This component is the whole answer to that: a plate that names the
 * current screen, and a bar that is the only navigation the app has.
 *
 * Two decisions in it are worth defending.
 *
 * **The active tab inverts.** Not a tint, not a heavier weight — the ground
 * itself flips to ink and the label is punched out of it. In a two-value
 * palette that is the only "selected" that survives being looked at sideways in
 * a gym, and it needs no colour to work, which the accessibility note in
 * PRODUCT.md requires. The lit dot above the label carries the same fact a
 * second time for anyone who cannot see the inversion.
 *
 * **`training` has a seat before it has a screen.** It is confirmed for V2 and
 * it is a peer of the diet rather than a page inside it, so its position is
 * decided now: adding it later would move every other tab under the user's
 * thumb. It renders unlit and inert. In a world built out of lamps, unlit is
 * already the word for "not yet" — it does not read as broken.
 */

/** Cell advance in `glyphs.ts`: five body columns plus one side bearing. */
const ADVANCE = 6;

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = activeTab(pathname);

  return (
    <>
      <NamePlate pathname={pathname} />
      {/* The bar is fixed, so the page owes it clearance — in `rem` for the bar
          itself plus whatever the phone's home indicator takes. A `div` rather
          than a `main`: every page in this app already brings its own, and two
          nested would be one landmark too many for a screen reader. */}
      <div className="flex flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <TabBar current={current} />
    </>
  );
}

function NamePlate({ pathname }: { pathname: string }) {
  const t = useTranslations("Nav");
  const key = plateKey(pathname);
  const name =
    key === undefined ? "DIETKIT" : t(`plate.${key}` as "plate.today");

  return (
    <header className="nd-screen sticky top-0 z-20 border-b-2 border-nd-ink bg-nd-ground">
      <div className="mx-auto flex w-full max-w-3xl items-center px-6 py-4">
        {/* Sized against the viewport rather than at a breakpoint: the plate
            holds words from four to eleven characters, and a fixed size that
            fits "PRIVACIDADE" wastes the line on "HOJE". The cap keeps it from
            becoming the loudest thing on a desktop window. */}
        <DotText
          style={{
            fontSize: `min(3.4px, calc((100vw - 4rem) / ${name.length * ADVANCE}))`,
          }}
        >
          {name}
        </DotText>
      </div>
    </header>
  );
}

function TabBar({ current }: { current: TabId }) {
  const t = useTranslations("Nav");

  return (
    <nav
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-nd-ink bg-nd-ground pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid w-full max-w-3xl grid-cols-5">
        {TABS.map((tab) => (
          <li key={tab.id} className="contents">
            {tab.href === undefined ? (
              <Slot id={tab.id} state="soon" label={t(tab.id as "today")}>
                <span className="text-[9px] tracking-[0.14em] uppercase">
                  {t("soon")}
                </span>
              </Slot>
            ) : (
              <Link
                href={tab.href}
                aria-current={current === tab.id ? "page" : undefined}
                className={slotClass(current === tab.id ? "on" : "off")}
              >
                <SlotBody
                  id={tab.id}
                  label={t(tab.id as "today")}
                  lit={current === tab.id}
                />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The seat with no screen behind it yet — inert, and announced as such. */
function Slot({
  id,
  state,
  label,
  children,
}: {
  id: TabId;
  state: "soon";
  label: string;
  children: ReactNode;
}) {
  return (
    <span aria-disabled="true" className={slotClass(state)}>
      <DotIcon name={id} className="text-[3px]" />
      <span className="sr-only">{label}</span>
      {children}
    </span>
  );
}

function SlotBody({
  id,
  label,
  lit,
}: {
  id: TabId;
  label: string;
  lit: boolean;
}) {
  return (
    <>
      <DotIcon name={id} className="text-[3px]" />
      <span className="text-[9px] tracking-[0.14em] uppercase">{label}</span>
      {/* Said twice on purpose. The inversion carries "selected" as a change of
          ground; this lamp carries it as a change of shape, which is what
          survives the bad light PRODUCT.md says this app gets used in. Only the
          active slot has one — the others keep the space so nothing shifts —
          because presence reads faster than a difference in tone. It takes
          `currentColor`, so it is white on the inverted slot without needing to
          know which theme it is in. */}
      <span
        aria-hidden="true"
        className={lit ? "h-1 w-6 bg-current" : "h-1 w-6 bg-transparent"}
      />
    </>
  );
}

function slotClass(state: "on" | "off" | "soon"): string {
  const base =
    "flex min-h-[4.25rem] flex-col items-center justify-center gap-1.5 px-1 py-2 text-center";

  if (state === "soon") return `${base} text-nd-unlit`;
  if (state === "on") return `${base} nd-invert bg-nd-ink text-nd-ground`;
  return `${base} text-nd-ink`;
}
