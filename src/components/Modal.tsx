"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * The dialog chrome every modal in this app is built from.
 *
 * Split out of `ConfirmDialog` when the weight form moved into a modal of its
 * own: the question dialog and the form dialog disagree about almost everything
 * below the title and agree about everything above it — and "everything above
 * it" is the part that is easy to get subtly wrong. Opening on the top layer,
 * trapping focus, making the page behind it inert, answering Escape, handing
 * the keyboard back on close: one implementation, so a second modal cannot ship
 * with three of the five.
 *
 * Built on the native `<dialog>` rather than a positioned `<div>` because
 * `showModal()` brings four of those five from the platform. It is deliberately
 * not `window.confirm`/`window.prompt`, which cannot be styled or translated
 * and block the whole tab.
 *
 * There is no `open` prop: rendering this component *is* opening it. That is
 * what keeps a modal from ever disagreeing with the state that opened it — the
 * data it needs comes from the same `undefined`-able value the call site is
 * already narrowing, so there is no second flag to keep in step.
 *
 * There is also no close control in the corner, on purpose. Every modal here
 * gives its way out a name — *Cancelar*, *Manter* — and a bare × would be both
 * a duplicate and the first thing `showModal()` focused, which is the one thing
 * the button order below is arranged to prevent.
 */

export function Modal({
  title,
  role = "dialog",
  wide = false,
  onClose,
  children,
}: {
  title: string;
  /**
   * `alertdialog` for a question with a consequence: a screen reader reads the
   * body out as it opens rather than waiting to be explored. Wrong for a form,
   * where the body is a set of controls and reading it aloud says nothing.
   */
  role?: "dialog" | "alertdialog";
  /** For a modal holding a form rather than a sentence. */
  wide?: boolean;
  /** Escape and a click on the backdrop both arrive here. */
  onClose: () => void;
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
    // still takes clicks.
    element?.showModal();

    /*
     * `showModal()` focuses the first focusable thing in the dialog, which on a
     * form is whichever box happens to be written first rather than the one the
     * user opened it to fill in. React's `autoFocus` cannot settle this: it
     * focuses during commit, *before* the line above overrules it, and React
     * does not emit the `autofocus` attribute that the platform's own dialog
     * focusing steps look for. So the choice is made here, once, and a call site
     * that has an opinion marks the control instead of each modal re-deriving
     * one. No marker means the platform's default, which is right for a
     * question.
     */
    element?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    return () => {
      element?.close();

      // `close()` puts focus back where it was, but only for a dialog still in
      // the document — and this one is closing precisely because React is
      // unmounting it, so that restore lands nowhere and the next Tab starts
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
      role={role}
      aria-labelledby={titleId}
      // Only where the body *is* the message. On a form it would read the
      // whole set of controls out before the user reached the first one.
      aria-describedby={role === "alertdialog" ? bodyId : undefined}
      onCancel={(event) => {
        // Escape closes the element on its own. Letting it would leave the DOM
        // shut while the state that renders this component still says open, and
        // the modal would not come back. Closing through React instead keeps
        // one source of truth.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop is reported against the dialog itself; one on
        // anything inside is reported against that child. Nothing else can
        // distinguish the two, which is why the card below is a separate
        // element — it makes "outside the card" and "not the dialog" the same
        // click.
        if (event.target === dialog.current) onClose();
      }}
      className={`m-auto w-[calc(100%-2rem)] bg-transparent p-0 text-foreground backdrop:bg-black/60 ${
        wide ? "max-w-lg" : "max-w-md"
      }`}
    >
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto rounded-lg border border-black/10 bg-background p-6 shadow-xl dark:border-white/15">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>

        <div id={bodyId} className="flex flex-col gap-4">
          {children}
        </div>
      </div>
    </dialog>
  );
}
