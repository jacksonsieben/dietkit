"use client";

import { useId, type ReactNode } from "react";

import type { EnergyUnit } from "@/lib/storage/types";

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
const FRAME = "border bg-background text-base text-foreground";

/**
 * A control at rest is an unlit cell, and typing in it lights it: the resting
 * border is `--nd-unlit` and focus lands the hard two-pixel ink ring globals.css
 * gives every focusable thing. An ink box around every field would make a form
 * of eight questions read as eight equally urgent ones.
 *
 * Split out because `UnitInput` picks between them in JavaScript — see there.
 */
const BORDER = "border-nd-unlit";
const INVALID_BORDER = "border-nd-red";

/**
 * A control that is not the width of its column.
 *
 * Split from `CONTROL_CLASS` because width is the one thing in this string that
 * is not a property of the control: a question on a form fills the column, and
 * a two-digit box sitting inline in a row of foods does not. Tailwind resolves
 * a class conflict by the order the rules sit in the stylesheet rather than the
 * order they are written in the attribute, so a caller appending `w-20` to a
 * string that already says `w-full` gets the full width and no warning — which
 * is exactly what happened to the min/max boxes on `/dieta`.
 */
export const CONTROL_BOX = `${FRAME} ${BORDER} px-3 py-2 aria-[invalid=true]:border-nd-red`;

/** The same control, filling its column — what a labelled `Field` wants. */
export const CONTROL_CLASS = `w-full ${CONTROL_BOX}`;

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

      <p id={hintId} className="text-xs text-nd-dim">
        {hint}
      </p>

      {error ? (
        <p id={errorId} className="text-xs text-nd-red-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A number and the unit it is in, as one control: the box on the left, a small
 * dropdown attached to its right edge.
 *
 * The shape is the one every phone-number field uses for the country code, and
 * it is here for the same reason — "25" and "%" are one answer, and a separate
 * select somewhere below the input turns reading the form into a lookup. The
 * unit is on the right rather than the left because in Portuguese, as in the
 * arithmetic, the number is what you read first.
 *
 * The invalid border is decided in JavaScript rather than by the
 * `aria-[invalid=true]:` variant `CONTROL_CLASS` uses: the frame is a `div`
 * around the input, so the attribute is not on the element being coloured, and
 * two border-colour utilities on one element would leave which of them wins to
 * the order Tailwind happened to emit them in.
 */
export function UnitInput({
  control,
  value,
  onValueChange,
  unit,
  onUnitChange,
  units,
  unitLabel,
  unitName,
}: {
  control: ControlProps;
  value: string;
  onValueChange: (value: string) => void;
  unit: string;
  onUnitChange: (unit: string) => void;
  units: readonly EnergyUnit[];
  unitLabel: string;
  unitName: (unit: EnergyUnit) => string;
}) {
  const { className: _frame, ...input } = control;

  return (
    <div
      className={`${FRAME} ${control["aria-invalid"] ? INVALID_BORDER : BORDER} flex items-stretch`}
    >
      <input
        {...input}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 py-2"
      />
      <select
        aria-label={unitLabel}
        value={unit}
        onChange={(event) => onUnitChange(event.target.value)}
        className={`border-l ${BORDER} bg-background px-2 text-sm text-foreground`}
      >
        {units.map((option) => (
          <option key={option} value={option}>
            {unitName(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
