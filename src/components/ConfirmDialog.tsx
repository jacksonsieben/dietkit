"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * The app's modal question: something is about to overwrite or destroy what is
 * already saved, and the user gets to answer before it does (#23).
 *
 * It exists because the alternative kept losing: a line of small text under the
 * inputs saying what Salvar would do sits outside the path the eye takes from
 * the last box to the button, and the measurement it warned about was gone by
 * the time anyone read it. A dialog is the same sentence placed where the click
 * has to go through it.
 *
 * Built on the native `<dialog>` rather than a positioned `<div>`, because
 * `showModal()` brings the four things a hand-rolled overlay has to reimplement
 * and usually half-does: the top layer (so no ancestor's `overflow` or
 * `z-index` can clip it), a focus trap, `inert` on the rest of the page, and
 * Escape. It is deliberately *not* `window.confirm`, which cannot be styled,
 * cannot be translated, and blocks the whole tab while it is up.
 *
 * There is no `open` prop: rendering this component *is* opening it. That is
 * what keeps a dialog from ever disagreeing with the state it asks about — the
 * data it needs to phrase the question comes from the same `undefined`-able
 * value the call site is already checking, so there is no second flag to keep
 * in step and no non-null assertion to write.
 */

export type ConfirmTone = "default" | "danger";

const CONFIRM_CLASS: Record<ConfirmTone, string> = {
  default: "bg-foreground text-background",
  danger: "bg-red-700 text-white dark:bg-red-600",
};

export function ConfirmDialog({
  title,
  confirmLabel,
  cancelLabel,
  tone = "default",
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  /** Omitted for a dialog that only has to be acknowledged. */
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  /** Also the answer to Escape and to a click on the backdrop. */
  onCancel: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;

    // `showModal()`, never the `open` attribute. An `open` dialog renders in
    // place: no top layer, no backdrop, no focus trap, and the page behind it
    // still takes clicks — which for a question about overwriting data is the
    // one thing that must not be true.
    element?.showModal();

    return () => {
      element?.close();

      // `close()` puts focus back where it was, but only for a dialog that is
      // still in the document — and this one is closing precisely because React
      // is unmounting it, so that restore lands nowhere and the next Tab starts
      // again from the top of the page. Put it back by hand.
      //
      // `isConnected` because the opener is often gone too: the *Apagar* that
      // opened a delete dialog belongs to the row the dialog just removed.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      // `<dialog>` is a plain `dialog` to a screen reader, which is announced
      // and then waited on. This one is an interruption with a consequence, so
      // the body should be read out as it opens.
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape closes the element on its own. Letting it would leave the DOM
        // shut while the state that renders this component still says open, and
        // the dialog would not come back. Cancelling through React instead
        // keeps one source of truth.
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        // A click on the backdrop is reported against the dialog itself; one on
        // anything inside is reported against that child. Nothing else can
        // distinguish the two, which is why the box below is a separate element
        // — it makes "outside the box" and "not the dialog" the same click.
        if (event.target === dialog.current) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 text-foreground backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-background p-6 shadow-xl dark:border-white/15">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>

        <div id={bodyId} className="text-sm opacity-80">
          {children}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {/*
           * First in the DOM on purpose, so it is what `showModal()` focuses.
           * Someone answering a warning with the keyboard should land on the
           * key that changes nothing, not on the one that agrees to it.
           */}
          {cancelLabel === undefined ? null : (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm underline underline-offset-4"
            >
              {cancelLabel}
            </button>
          )}

          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium ${CONFIRM_CLASS[tone]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
