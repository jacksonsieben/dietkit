"use client";

import type { ReactNode } from "react";

import { Modal } from "@/components/Modal";
import { ActionButton, Ghost } from "@/components/nd/kit";

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
 * The chrome is `Modal`; what is left here is the part that makes this a
 * question rather than a panel — `alertdialog` so the body is read out as it
 * opens, two answers, and the harmless one first.
 */

export type ConfirmTone = "default" | "danger";

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
  /*
   * Which answer is drawn as the filled block, and it is not always the one
   * that agrees (#68).
   *
   * This used to be a red *Excluir* against a plain *Cancelar*, and red is not
   * available for it any more: in this palette red means a number is off
   * target, and a deletion someone asked for by pressing *Excluir* is not a
   * fault. Spending the one warning colour on it would leave nothing to say
   * with when a number really is wrong.
   *
   * So the distinction moves to which answer the screen is recommending, which
   * is what the filled block has meant everywhere else in this world. On an
   * ordinary question that is the one that proceeds. On a question about losing
   * a measurement it is *Manter* — and since `showModal()` focuses the first
   * focusable element and the cancel is written first, the filled button and
   * the focused button are the same button. Someone answering with the keyboard
   * and someone answering with their eyes get the same recommendation.
   */
  const dangerous = tone === "danger";
  const Confirm = dangerous ? Ghost : ActionButton;
  const Cancel = dangerous ? ActionButton : Ghost;

  return (
    <Modal title={title} role="alertdialog" onClose={onCancel}>
      <div className="text-sm leading-relaxed">{children}</div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/*
         * First in the DOM on purpose, so it is what `showModal()` focuses.
         * Someone answering a warning with the keyboard should land on the
         * key that changes nothing, not on the one that agrees to it.
         */}
        {cancelLabel === undefined ? null : (
          <Cancel type="button" onClick={onCancel}>
            {cancelLabel}
          </Cancel>
        )}

        <Confirm type="button" onClick={onConfirm}>
          {confirmLabel}
        </Confirm>
      </div>
    </Modal>
  );
}
