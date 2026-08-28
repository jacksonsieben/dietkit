import type { NoticeId, Settings } from "@/lib/storage/types";

/**
 * The standing notices, and the rule for putting one away.
 *
 * Two things sit at the foot of every screen and never leave: the backup prompt
 * (#26) and the source-and-fine-print footer. Each earned its place — one warns
 * about a loss that has no symptom until it is total, the other is a licence
 * condition — and each was written as if it were the only one. Together they
 * are a permanent band at the bottom of the app that the user has read, and a
 * warning that is read once and then ignored for ever is decoration.
 *
 * So dismissal is real here: answered once, saved, and not asked again. The
 * three things that keeps honest:
 *
 * - **It is stored, not remembered.** `Settings.dismissedNotices` rides in the
 *   snapshot and the sync journal like every other preference, so the answer
 *   survives a reload, reaches the user's other devices, and is in the backup
 *   file — a dismissal that lived in `localStorage` would come back on the next
 *   phone and prove the button was a lie.
 * - **It is reversible in one place.** `/mais` lists what is hidden and brings
 *   it all back. Permanent-until-asked is a promise the app can keep; permanent
 *   -full-stop is one it should not make about a data-loss warning.
 * - **It never hides what is not ours to hide.** See `NOTICE_FLOOR`.
 */

/** The notices offered, in the order `/mais` lists them. */
export const DISMISSIBLE_NOTICES = ["backup", "legal"] as const;

/**
 * What survives dismissal, and why.
 *
 * The TACO permission is "reproduction is permitted provided the source is
 * cited", and docs/TACO-LICENSING.md turns that into a rule with no exception
 * in it: attribution is not a settings toggle, and no screen shows a TACO
 * number without a route to the credit. That rule is not the user's to switch
 * off and it is not this module's to negotiate — so dismissing `legal` collapses
 * the footer to exactly the credit and the link to `/fontes`, and takes the
 * three notice links (which are reachable from `/mais`) with it.
 *
 * Recorded here rather than only in the component, because the next person to
 * touch that footer will read the code before they read the doc.
 */
export const NOTICE_FLOOR = {
  legal: "credit + /fontes",
} as const;

/**
 * The message key naming a notice on `/mais`, derived rather than written out,
 * so a notice added to `DISMISSIBLE_NOTICES` without a name for it fails the
 * catalogue test instead of rendering its own id at the user.
 */
export type NoticeLabel = `notice_${NoticeId}`;

export function isNoticeDismissed(
  settings: Settings,
  notice: NoticeId,
): boolean {
  return settings.dismissedNotices?.includes(notice) ?? false;
}

/**
 * The list to save when `notice` is put away — idempotent, so a second click on
 * a strip that has not gone yet cannot write it twice.
 */
export function withNoticeDismissed(
  settings: Settings,
  notice: NoticeId,
): NoticeId[] {
  const current = settings.dismissedNotices ?? [];
  return current.includes(notice) ? [...current] : [...current, notice];
}

/**
 * The list to save when `notice` is brought back.
 *
 * The counterpart matters as much as the button that hides things: a dismissal
 * with no way back is not a preference, it is a deletion the user performed by
 * accident. `/mais` is where this is spent.
 */
export function withNoticeRestored(
  settings: Settings,
  notice: NoticeId,
): NoticeId[] {
  return (settings.dismissedNotices ?? []).filter((id) => id !== notice);
}

/** What is currently hidden, in `DISMISSIBLE_NOTICES` order. */
export function dismissedNotices(settings: Settings): NoticeId[] {
  return DISMISSIBLE_NOTICES.filter((notice) =>
    isNoticeDismissed(settings, notice),
  );
}
