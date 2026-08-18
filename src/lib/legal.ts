/**
 * The facts the three legal notices have to agree on.
 *
 * Kept here rather than in the message catalogue because these are not copy —
 * they are the identity of whoever answers for the service and the date the
 * terms took effect. A privacy notice whose "last updated" line disagrees with
 * the terms it sits beside is the kind of detail that makes a reader stop
 * believing the rest of it.
 */

/**
 * When the current text of the notices took effect.
 *
 * ISO here, formatted for reading at the point of display — pt-BR writes dates
 * as "18 de agosto de 2026", and hard-coding that string would put a second
 * copy of the date somewhere it could drift.
 *
 * Bump this whenever the substance of any of the three documents changes, not
 * when a typo is fixed: it is the date a reader uses to work out whether the
 * terms they agreed to are the ones on screen.
 */
export const LEGAL_EFFECTIVE_DATE = "2026-08-18";

/**
 * `LEGAL_EFFECTIVE_DATE` as a `Date`, fixed at UTC midnight.
 *
 * The zone is not decoration. `new Date("2026-08-18")` is UTC midnight, and
 * rendering that in São Paulo (UTC−3) prints the 17th — a notice that claims to
 * have taken effect a day before it did. Callers must format it with
 * `timeZone: "UTC"` so the date that comes out is the date written above.
 */
export function legalEffectiveDate(): Date {
  return new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`);
}

/**
 * The three notices, and the order they are offered in.
 *
 * One list rather than link sets written out per screen: a reader who lands on
 * any of them has to be able to reach the other two, the footer has to offer all
 * three, and a fourth notice added later should not depend on somebody
 * remembering to edit five files. `label` is a key in the `Legal` namespace.
 */
export const LEGAL_ROUTES = [
  { href: "/privacidade", label: "privacyLink" },
  { href: "/termos", label: "termsLink" },
  { href: "/saude", label: "healthLink" },
] as const;

export type LegalRoute = (typeof LEGAL_ROUTES)[number]["href"];

/**
 * Where to reach whoever is responsible for the service.
 *
 * TODO(before public launch): the LGPD expects a *controlador* to be
 * identifiable, and expects a named channel for data-subject requests
 * (art. 41). DietKit holds no personal data on the server, which makes those
 * requests close to vacuous — there is nothing to hand over or erase — but
 * "there is no controller" is not a thing a notice can say. Whoever publishes
 * this has to appear here: a name, and a real address for enquiries.
 *
 * Until then this points at the public repository, which is a real channel and
 * an honest one for a project that has not launched.
 */
export const LEGAL_CONTACT = {
  /** Issue tracker — public, archived, and monitored by the maintainer. */
  url: "https://github.com/jacksonsieben/dietkit/issues",
  label: "github.com/jacksonsieben/dietkit",
} as const;

/**
 * The professional-council position that § D10 turns on.
 *
 * Lei nº 8.234/1991 lists dietary prescription among the activities private to
 * the registered nutritionist. DietKit therefore computes and presents; it does
 * not prescribe, and the copy says so in those words rather than hedging.
 */
export const CFN_REFERENCE = {
  law: "Lei nº 8.234/1991",
  council: "Conselho Federal de Nutricionistas (CFN)",
} as const;
