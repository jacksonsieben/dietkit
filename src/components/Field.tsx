"use client";

import { useId, type ReactNode } from "react";

/**
 * The one form control this app draws, shared by every screen that asks for a
 * number (#12, #15).
 *
 * Shared rather than copied because of what `CONTROL_CLASS` below turned out to
 * be: a string where one word decides whether a dropdown is readable in dark
 * mode. A second copy of it is a second place for that to regress, in a way no
 * screenshot of the page would show.
 */

interface ControlProps {
  id: string;
  "aria-describedby": string;
  "aria-invalid": boolean;
  className: string;
}

/**
 * `bg-background text-foreground` rather than `bg-transparent`, which is what
 * this was and what broke the dropdown in dark mode.
 *
 * A transparent background looks identical on the closed control — the body
 * shows through — but the `<select>` popup is a surface the browser draws for
 * itself, and an author-declared `background-color` of `rgba(0,0,0,0)` gets
 * composited over that surface rather than over the page. The result was the
 * palette's light-grey text on the UA's white: unreadable, and invisible in any
 * screenshot of the page, because the popup is not part of the page.
 *
 * `color-scheme` in globals.css is the other half of this and is not
 * interchangeable with it: that one tells the browser which defaults to use,
 * this one stops us overriding them with a transparency we never wanted.
 */
export const CONTROL_CLASS =
  "w-full rounded-md border border-black/15 bg-background px-3 py-2 text-base text-foreground aria-[invalid=true]:border-red-600 dark:border-white/20 dark:aria-[invalid=true]:border-red-500";

/**
 * Label, control, hint and error as one unit.
 *
 * The control is a render prop rather than a `type` string because three of
 * these are text inputs, one is a date input and one is a `<select>`, and a
 * component that switched on a prop to decide which element to render would be
 * harder to read than the five call sites it saved.
 */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint: string;
  error?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      {children({
        id,
        "aria-describedby": error ? `${hintId} ${errorId}` : hintId,
        "aria-invalid": error !== undefined,
        className: CONTROL_CLASS,
      })}

      <p id={hintId} className="text-xs opacity-60">
        {hint}
      </p>

      {error ? (
        <p id={errorId} className="text-xs text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
