"use client";

import { useState, type ChangeEvent } from "react";

import { ACTION } from "@/components/nd/kit";

/**
 * A file input that speaks the page's language.
 *
 * The native control is the one widget on any of these screens that a browser
 * insists on drawing in its own voice: a grey chrome button whose words come
 * from the *browser's* locale, not the page's. On a Portuguese screen it reads
 * "Choose File — No file chosen", in a typeface nothing else here uses, and no
 * amount of border and padding on the input reaches inside it.
 *
 * So the input stays and stops being seen. It is the only thing that can open a
 * file dialog, and hiding it with `sr-only` rather than `display: none` keeps
 * it focusable, keeps the label bound to it, and keeps the keyboard path
 * intact — a `<label>` drawn as an `Action` opens the dialog on click, and the
 * focus ring is borrowed onto that label with `peer-focus-visible`.
 *
 * The chosen filename is held here rather than passed in, because it is the
 * control's own business: the screen around it cares what is *in* the file,
 * and by the time it knows that, the name is already stale.
 */
export function FileField({
  id,
  accept,
  label,
  hint,
  action,
  empty,
  onChange,
}: {
  id: string;
  accept: string;
  label: string;
  hint: string;
  /** The word on the button — "Escolher arquivo". */
  action: string;
  /** What stands in for the filename before there is one. */
  empty: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [name, setName] = useState<string>();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          type="file"
          accept={accept}
          className="peer sr-only"
          onChange={(event) => {
            setName(event.target.files?.[0]?.name);
            onChange(event);
          }}
        />
        <label
          htmlFor={id}
          className={`${ACTION} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-nd-ground`}
        >
          {action}
        </label>
        {/* Mono, because it is a filename: a string the machine gave back,
            shown so the person can check the machine heard them. */}
        <span className="font-mono text-xs text-nd-dim">{name ?? empty}</span>
      </div>
      <p className="text-xs text-nd-dim">{hint}</p>
    </div>
  );
}
