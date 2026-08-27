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
export const LEGAL_EFFECTIVE_DATE = "2026-08-26";

/**
 * `LEGAL_EFFECTIVE_DATE` as a `Date`, fixed at UTC midnight.
 *
 * The zone is not decoration. `new Date("2026-08-26")` is UTC midnight, and
 * rendering that in São Paulo (UTC−3) prints the 25th — a notice that claims to
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
 * Who answers for the service, and where.
 *
 * The LGPD expects a *controlador* to be identifiable and expects a named
 * channel for data-subject requests (art. 41); the GDPR expects the same
 * identity in the notice itself (art. 13). While nothing personal reached the
 * server, that duty was close to vacuous — there was nothing to hand over or
 * erase — and this constant pointed at the issue tracker. Accounts (#93) and
 * sync (#96) end that argument: there is now an email address on a server, a
 * consent record beside it, and a person who has to answer for both.
 *
 * The same person is the *encarregado* / DPO, which is what a one-maintainer
 * project honestly has. No postal address is published: an individual
 * controller is identified by name and by a channel that reaches them, and
 * printing a home address in a public notice protects nobody.
 *
 * The repository stays alongside it, because a bug report and a data-subject
 * request are different things and only one of them belongs in a public issue.
 */
export const LEGAL_CONTACT = {
  /** The controller, and the encarregado: the same person, in Portugal. */
  controller: "Jackson Sieben",
  /**
   * The channel for privacy requests. Monitored by the controller.
   *
   * At the apex, not at the app's own host: `dietkit.jacksonsieben.com` is a
   * CNAME to the deployment, and a name holding a CNAME can hold no other
   * record — an MX there is impossible while the site resolves. An address at
   * that host would be a contact channel in the notice that silently bounces
   * every request art. 41 exists to let somebody make.
   */
  email: "dietkit.privacidade@jacksonsieben.com",
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
