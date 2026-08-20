"use client";

import type { ReactNode } from "react";

import { Modal } from "@/components/Modal";

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
  return (
    <Modal title={title} role="alertdialog" onClose={onCancel}>
      <div className="text-sm opacity-80">{children}</div>

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
    </Modal>
  );
}
