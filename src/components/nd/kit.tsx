import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Link } from "@/i18n/navigation";

/**
 * The shared vocabulary of the instrument world.
 *
 * These five pieces started life as private helpers inside `Today.tsx`, where
 * they were fine for exactly as long as one screen spoke this language. They
 * are here now because the second screen needs the identical column width, the
 * identical rule weight and the identical button, and two copies of a 2px line
 * is how a design system quietly becomes two design systems.
 *
 * Nothing in this file knows anything about diets. It is the paper, the ruler
 * and the two kinds of button; everything with a meaning lives elsewhere.
 */

/**
 * The column. 48rem at every width, with a 1.5rem gutter — the charter's
 * "one column at every width", so the desktop view is the phone view with air
 * around it rather than a reflow into panels.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      {children}
    </div>
  );
}

/**
 * A whole screen that is one sentence long — loading, empty, or broken. It
 * keeps the column so the sentence lands where the content would have.
 */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <p className="text-sm text-nd-dim">{children}</p>
    </Shell>
  );
}

/** A rule, not a card: the world here is ruled sheets, not floating boxes. */
export function Rule() {
  return <hr className="border-0 border-t-2 border-nd-ink" />;
}

/**
 * The lighter of the two lines, for separating rows inside a section that the
 * 2px rule has already opened. Unlit rather than ink, because a list of eight
 * meals divided by eight full-strength rules reads as eight sections.
 */
export function Hairline() {
  return <hr className="border-0 border-t border-nd-unlit" />;
}

/**
 * The label over a readout.
 *
 * Uppercase and letter-spaced, which the craft floor calls an eyebrow and bans;
 * it is carried here as the documented exception, because a legend over an
 * instrument's readout is native to the world this app was pinned to. It is not
 * house style, and it is still wrong anywhere else.
 */
export function Legend({
  as: Tag = "span",
  id,
  children,
}: {
  /**
   * The element to draw it as. A legend is usually just a label, but where it
   * is the only thing naming a section it has to be a heading as well, or the
   * document outline has a hole in it exactly where the section is.
   */
  as?: "span" | "h1" | "h2" | "h3" | "h4";
  /** For `aria-labelledby`, so a table can be named by the legend above it. */
  id?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      id={id}
      className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase"
    >
      {children}
    </Tag>
  );
}

/**
 * The only filled element on a screen besides a lit segment: a block of ink
 * with the ground punched out of it. `nd-invert` swaps the focus ring to the
 * ground colour, since an ink ring on an ink fill is no ring at all.
 */
export const ACTION =
  "nd-invert inline-flex w-fit items-center justify-center bg-nd-ink px-5 py-3 text-sm font-medium tracking-[0.08em] text-nd-ground uppercase disabled:bg-nd-unlit disabled:text-nd-dim";

export function Action({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={ACTION}>
      {children}
    </Link>
  );
}

export function ActionButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${ACTION} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/**
 * A link inside running text, or under it.
 *
 * Not every navigation on a screen is an intention. "See where this target came
 * from" is an aside, and drawn as an inverted block it would compete with the
 * one thing the screen is actually for. So it stays a link and looks like one:
 * underlined, offset far enough that the descenders clear it, and taking its
 * size from the paragraph it belongs to.
 */
export function TextLink({
  href,
  className = "text-sm",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`w-fit underline underline-offset-4 ${className}`}
    >
      {children}
    </Link>
  );
}

/**
 * The second button: the same block, outlined instead of filled.
 *
 * A screen full of inverted blocks has no primary action, so the ones that are
 * available rather than intended — add a meal, even out the shares, remove a
 * row — are drawn as an empty frame. Disabled is a change of ink and border,
 * never `opacity`: fading type is the one hierarchy device this world does not
 * own, and a half-transparent control on a dot field reads as a rendering bug.
 */
export function Ghost({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`inline-flex w-fit items-center justify-center border border-nd-ink px-3 py-1.5 text-xs font-medium tracking-[0.08em] text-nd-ink uppercase disabled:border-nd-unlit disabled:text-nd-dim ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
