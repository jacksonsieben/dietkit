# Privacy operations

The three public notices say what we tell people. This file says what we do, and
it is the document a supervisory authority, a lawyer or a future maintainer asks
for when the notice is not enough: the record of processing, the impact
assessment, the incident clock, the retention schedule and the runbook for a
request from a person.

It is written for a service with **one controller, no employees and no offices**,
and it stays proportionate to that. Nothing here is padding for its own sake:
where the honest answer is "we do not hold that", the answer is written down as
"we do not hold that" rather than as a procedure for handling it.

- **Controller:** Jackson Sieben, established in Portugal. Sole controller.
- **Contact for privacy matters:** privacidade@dietkit.jacksonsieben.com
- **Encarregado / DPO:** the controller, acting personally. Whether the LGPD
  requires a separately named *encarregado* at this scale is [question 1](#questions-for-the-lawyer).
- **Supervisory authorities:** CNPD (Portugal) for the GDPR; ANPD (Brazil) for
  the LGPD.
- **In force since:** 26 August 2026. Same date as the public notices
  (`LEGAL_EFFECTIVE_DATE` in `src/lib/legal.ts`), and the two move together.

**Review triggers**, rather than a calendar reminder nobody honours: a new
processor, a new category of data, a change to what the server may learn
(docs/DECISIONS.md § D23), an incident, an authority contact, a change in the
Neon Auth schema that the audit reports, or opening the service to people other
than the controller.

---

## What is not processed, and why that is the first section

Profile, weight history, diets, custom foods, substitution groups, settings, the
training rotation and the training log are written to **IndexedDB on the
person's own device** and are never sent to a server in readable form. With sync
off there is no server copy at all. With sync on there is a copy, and it is
ciphertext the controller cannot open.

This is not a claim about intentions. It is enforced by tests that fail the
build:

| Check | What it refuses |
| --- | --- |
| `src/lib/db/boundary.test.ts` | Any column in any non-system schema that is not on an allowlist. `public` keeps the reference-data rules; `neon_auth` has a per-column allowlist with a reason next to each name; the `sync` schema gets the opposite kind of rule — a per-table allowlist, so a well-meant `row_count_hint` fails — plus a check on the table names themselves: `sync.weights` would announce in the name what the ciphertext exists to hide, and `sync.consent` is the one table allowed to say what it holds |
| `src/lib/db/accounts.ts` + `scripts/db/audit-accounts.ts` | A column appearing upstream in Neon Auth's managed schema that nobody signed off, and any row in the three organisation tables this app does not use |
| `src/account-optional.test.ts` | An import of the auth module from anywhere outside the account screens — the app has to keep working with no account at all |
| `src/lib/db/erasure.test.ts` | An account id surviving anywhere in the database after deletion. It sweeps `information_schema`, so a table added later is covered without anyone remembering |
| `src/i18n/messages.test.ts` | A notice string that is empty, unformatted or missing from a locale |

Encrypted personal data is still personal data (GDPR recital 26 — encryption is
pseudonymisation, not anonymisation), so the sealed rows appear in the record
below as processing. The point of the encryption is that it collapses what a
breach of the database can reveal, not that it removes the rows from scope.

---

## Record of processing activities

GDPR art. 30 / LGPD art. 37. **The art. 30(5) exemption does not apply**: it is
lifted where processing of special-category data is regular rather than
occasional, and health data is the substance of this service.

Common to every activity below unless stated otherwise:

- **Categories of data subject:** individual users of the application. There is
  no other category — no employees, no customers, no contacts, and no data about
  people who are not users. (`invitation.email` in the Neon Auth schema is the
  one column that could hold a third party's address; there is no screen that
  writes it, and the audit asserts the table empty.)
- **Recipients:** none. No advertising, no analytics, no sale, no sharing. The
  only third parties are the two processors named below.
- **International transfers:** none outside the EU. Everything is in
  `eu-central-1`, Frankfurt, Germany. For users in Brazil, storage in the EU is
  covered by LGPD art. 33, I, following the ANPD's recognition of the EU/EEA as
  providing adequate protection (Res. CD/ANPD nº 32/2026).

### A1 — Reference lookups (food search, exercise catalog)

| Field | Value |
| --- | --- |
| Purpose | Answering a food search against the TACO table; serving the exercise catalog |
| Data | The search term typed by the person. It travels in the request URL and therefore appears in the infrastructure logs of A5 |
| Legal basis | GDPR art. 6(1)(f), legitimate interest in operating the feature the person just asked for; LGPD art. 7, IX. No special-category basis is needed: a food name is not a health datum about the person, though it is written down here because it *leaves the device* |
| Retention | Not stored in any database. Present only in Vercel's logs (A5) |
| Where | `src/app/api/foods`, `src/lib/db/foods.ts` |

### A2 — The account

| Field | Value |
| --- | --- |
| Purpose | Letting one person reach their own encrypted rows from a second device. The account exists for no other purpose and gates no other feature |
| Data | Email address and whether it is verified; a hash of the sign-in password; one row per signed-in device carrying an IP address, a user agent and an expiry; short-lived proofs for address confirmation and password reset. The full column list, with a reason beside each, is `src/lib/db/accounts.ts` |
| Not collected | Name, date of birth, sex, address, phone, payment details. `user.name` exists in the upstream schema and is written as an empty string |
| Legal basis | GDPR art. 6(1)(b), performance of the service the person asked for; art. 6(1)(f) for the security fields (IP, user agent). LGPD art. 7, V and IX |
| Processor | Neon (Neon Auth, managed beta, Better Auth underneath) |
| Retention | Until the account is deleted. Deletion is immediate and total — see the schedule below |
| Where | `src/lib/auth/*`, schema owned by Neon in `neon_auth` |

### A3 — Cross-device sync of encrypted records

| Field | Value |
| --- | --- |
| Purpose | Moving the person's own records between their own devices |
| Data | `sync.rows`: account id, an opaque collection string, a record id, ciphertext, a nonce, a revision and timestamps. `sync.vault`: the account's data key, wrapped twice — once under the passphrase, once under the recovery code — plus salt and KDF parameters. **The controller cannot read any of it** |
| Special category | Yes, in substance: the plaintext is health data (GDPR art. 9; LGPD art. 5, II). It is treated as special-category throughout even though the controller only ever holds the sealed form |
| Legal basis | **Explicit consent** — GDPR art. 9(2)(a) with art. 6(1)(a); LGPD art. 11, I. Sync is off until the person turns it on, the notice version they saw is recorded with the consent, and withdrawal is one button (A4) |
| Metadata the server does learn | That the account exists and its address; when it last synced and from how many devices; how many rows it holds and how big they are. That list is exhaustive and is docs/DECISIONS.md § D23 |
| Retention | Until sync is switched off or the account is deleted, whichever comes first. Switching off deletes the rows and the wrapped key immediately |
| Security | AES-256-GCM with a fresh 96-bit nonce per write; one data key per account, generated on the device; PBKDF2-HMAC-SHA256 at 600 000 iterations for the passphrase wrapping; a 125-bit recovery code for the other wrapping. No column anywhere holds a passphrase or a recovery code |
| Where | `src/lib/sync/*`, `src/lib/db/schema/sync.ts` |

### A4 — The consent record

| Field | Value |
| --- | --- |
| Purpose | Being able to demonstrate consent, and its withdrawal, as GDPR art. 7(1) requires |
| Data | Account id, the version of the notice that was on screen, the timestamp of consent, and the timestamp of withdrawal if it happened. Four columns, nothing else |
| Legal basis | GDPR art. 6(1)(c) — a legal obligation to be able to demonstrate consent — and art. 7(1). LGPD art. 8, § 2º |
| Retention | While the account exists, including after sync is switched off. Deleted with the account |
| Where | `sync.consent`, written by `src/lib/sync/vault-store.ts` |

### A5 — Infrastructure logs

| Field | Value |
| --- | --- |
| Purpose | Operating and securing the site. Not ours to choose in detail: these are the platform's request logs |
| Data | IP address, user agent, requested URL, timestamps. The URL is why the food search term of A1 is listed there |
| Legal basis | GDPR art. 6(1)(f); LGPD art. 7, IX |
| Processor | Vercel |
| Retention | Vercel's own retention for platform logs. Not copied into any database of ours |
| Note | No analytics product of any kind is loaded, including the ones marketed as cookie-free — they identify visitors by IP and user agent, which is still personal data |

### A6 — Rate limiting on sign-in and password reset

| Field | Value |
| --- | --- |
| Purpose | Making credential stuffing expensive while Neon Auth's beta has no rate limiting of its own |
| Data | A salted SHA-256 of the email address and of the network block, held **in the memory of the running function instance** and lost when it recycles. The salt is random per process |
| Legal basis | GDPR art. 6(1)(f); LGPD art. 7, IX |
| Retention | Minutes, and no persistence. A table of "this address tried to sign in at this time" is exactly the record § D23 forbids, which is why there is not one |
| Where | `src/lib/auth/throttle.ts` |

---

## Processors

GDPR art. 28 / LGPD art. 39. Two, and no sub-processor engaged by us.

| Processor | Role | Location | What it holds |
| --- | --- | --- | --- |
| **Neon** | Database and managed accounts (Neon Auth) | eu-central-1, Frankfurt | Reference data; the account tables; the sealed rows, the wrapped key and the consent record |
| **Vercel** | Hosting and function execution | Frankfurt | No database. Infrastructure logs (A5) |

**Open, and honestly open:** the confirmation and password-reset emails are sent
by Neon Auth's own mailer. It does not currently allow configuring a sender and
does not publish which delivery provider it uses underneath. That provider is a
sub-processor handling an email address, and it is not named in the public
notice because we do not know its name. The question is with Neon; the notice
says so in as many words, and this line disappears when there is an answer.

**Also open:** confirm and file the art. 28 terms with both processors (the DPA
each publishes, plus its sub-processor list), so that "there is a contract" is a
reference and not a recollection.

---

## Data protection impact assessment

GDPR art. 35. Required here because the processing is of health data using a
design most users have never met before. Kept short on purpose: the honest
finding is that the architecture removes most of what a DPIA usually has to
argue about, and the remaining risks are few enough to list.

### Systematic description

1. The app runs entirely on the device. Personal data is written to IndexedDB
   and read from it. No account, no server, no network call for anything except
   the food and exercise reference data.
2. If the person wants a second device, they create an account: an email
   address and a password, nothing else.
3. If they then turn sync on, they are shown what leaves the device and what
   the server will learn, and the version of that notice is recorded with their
   consent. A data key is generated **on the device**, wrapped under their
   passphrase and under a recovery code shown once, and the two wrapped copies
   are uploaded. The key itself never leaves.
4. Each record is sealed with that key and pushed as ciphertext plus a nonce
   under an opaque collection name. A second device unlocks the vault with the
   passphrase or the recovery code and can then read the rows. Nothing in
   between can.
5. Switching sync off deletes the rows and the wrapped key immediately and keeps
   the consent record. Deleting the account deletes everything, in one statement,
   and then the registration upstream.

### Necessity and proportionality

- **Data minimisation is the default, not a setting.** The account is asked for
  an address and a password. Age, name and sex are never asked for by the
  server; the profile that holds them stays on the device.
- **The purpose is achievable no other way.** Cross-device sync needs a shared
  identifier and a place to put bytes. It does not need readable bytes, so it
  does not get them.
- **Consent is real.** The service is fully usable with sync off, so consent is
  freely given (GDPR art. 7(4)); it is opt-in, specific to this processing, and
  withdrawable in one action that deletes the server copy at once.
- **No secondary use.** No profiling, no advertising, no analytics, no training
  of anything on anybody's data, no sale.

### Risks, and what answers each

| # | Risk | Measure | Residual |
| --- | --- | --- | --- |
| R1 | The database is breached or an insider at the processor reads it | Rows and key material are AES-256-GCM ciphertext; the key exists only on the person's devices | Low. What leaks is metadata: addresses, timing, row counts and sizes |
| R2 | An account is taken over — stolen password, or a session minted upstream (`session.impersonatedBy` exists in the schema) | The session reaches ciphertext only. Reading it needs the passphrase or the recovery code, neither of which has a column anywhere | Low for content; the metadata of R1 is exposed |
| R3 | Metadata is itself revealing — an address plus "syncs daily from two devices" | Accepted and published rather than mitigated: § D23 lists exactly what the server may learn, and the notice repeats it. Collection names are opaque so the server cannot tell a weight log from a diet | Accepted |
| R4 | The search term for a food reaches the logs through the URL | Documented in the notice rather than hidden. Not stored in any database, not associated with an account | Accepted |
| R5 | The person forgets the passphrase and loses the recovery code | Two independent wrappings, a code with 125 bits of entropy, shown once with an explicit warning; export exists and is offered next to the delete button | Accepted, by design. This is an availability risk to the person, and the notice says plainly that nobody can recover it |
| R6 | Local data is lost — cleared storage, a new device, an uninstall | Export/import is a first-class screen, named as the only backup this architecture offers | Accepted and published |
| R7 | The managed beta changes its schema and starts collecting something new | An allowlist per column with a reason beside each, checked by a test against the fixture and by a script against the real branch | Low, and it fails loudly |
| R8 | Deletion misses a table added later | The erasure test sweeps the catalog rather than naming tables | Low |
| R9 | A sub-processor we cannot name handles email addresses | Open item above. Scope is limited to the address and the message | Open until Neon answers |

### Conclusion

Residual risk is not high in the sense of GDPR art. 36(1), so no prior
consultation with the CNPD is planned. Reassess on any review trigger, and in
particular if the design ever moves a key, a plaintext record or a
recoverable-by-us secret onto the server — at which point this document and the
notices are both wrong and the feature waits.

---

## Retention schedule

Numbers, not "as long as necessary". These are the same numbers as the public
notice; if one changes, both change.

| Data | Kept | Removed by |
| --- | --- | --- |
| Sealed rows (`sync.rows`) | While sync is on | Switching sync off; deleting the account. Immediate, no soft delete, no trash |
| Wrapped key and salt (`sync.vault`) | While sync is on | Same |
| Consent record (`sync.consent`) | While the account exists, including after withdrawal | Deleting the account |
| Account, credential, verification proofs (`neon_auth`) | While the account exists | Deleting the account |
| Sessions | Until sign-out or expiry | Sign-out, with up to a 5-minute window where the upstream cache may still accept it |
| Storage-layer restore window | Neon's history retention, **currently understood to be 1 day** — confirm in the console and correct here and in both notice strings if it differs | Elapsing. The rows it holds are ciphertext whose key was deleted with them |
| Infrastructure logs | Vercel's platform retention | Not ours to delete; not copied anywhere of ours |
| Everything on the device | Until the person clears it | Clearing site data in the browser; uninstalling |

Deleting the account is one statement across `sync.rows`, `sync.vault` and
`sync.consent` (`src/lib/db/erasure.ts`), then the registration upstream. The
order is deliberate: the password is proven first, the data goes second, the
identity last, so no failure can leave rows keyed to an id that no longer exists.

---

## Incident procedure

Two regimes, one clock. **Design to the 72 hours** of GDPR art. 33, and the
ANPD's three business days (Res. CD/ANPD nº 15/2024) are met on the way.

**The clock starts at awareness**, not at certainty. A credible report counts.

1. **Write down the time you became aware.** Everything else is measured from
   it. Open the register entry now, not at the end.
2. **Contain.** Rotate what can be rotated (`NEON_AUTH_COOKIE_SECRET`, database
   credentials), revoke sessions, take the affected path offline if that is what
   it takes. Availability is worth less than the data.
3. **Establish scope.** Which activity from the record? Which accounts? Was any
   *plaintext* involved, or only sealed rows? For sealed rows the question that
   decides everything is whether the vault — the wrapped key — went with them,
   and whether the passphrase could plausibly be brute-forced from it.
4. **Assess risk to people.** Metadata only (addresses, timings, counts) is a
   real breach and is notifiable; sealed rows without the key are the case GDPR
   art. 34(3)(a) contemplates for not notifying individuals — but that is an
   argument to make case by case and to write down, not a licence to stay quiet.
5. **Notify the CNPD within 72 hours** unless the breach is unlikely to result in
   a risk to rights and freedoms — and record the reasoning either way. Include
   what art. 33(3) requires: nature, categories and approximate numbers, contact
   point, likely consequences, measures taken. A partial notification on time
   beats a complete one late; art. 33(4) allows the rest in phases.
6. **Notify the ANPD** if Brazilian users are affected, within three business
   days, in the format the resolution prescribes.
7. **Notify the affected people** where art. 34 or LGPD art. 48 requires it, in
   plain language, saying what was and was not readable and what they should do.
8. **Close the register entry** with the timeline, the decision and its reason,
   and what changed so it does not recur.

**The register**, kept for **five years** whether or not the incident was
reported — the ANPD requires the record of *every* incident, and there is no
"too small to write down". One Markdown file per incident, in a private
repository, containing: when it started and when you became aware; how it was
discovered; which activity and which data; how many people; whether plaintext or
only ciphertext; what was done and when; who was notified, when, and if not, why
not; the fix.

There have been **no incidents** as of the date at the top of this file.

---

## Data-subject request runbook

Timelines: **one month** under GDPR art. 12(3), extendable by two further months
for complex requests with an explanation inside the first month. Under the LGPD,
an immediate answer in simplified form and **fifteen days** for the full
declaration (art. 19, § 1º, II). The public notices promise the tighter pair, so
answer within fifteen days and do not use the extension without a real reason.

**Identity.** Requests arrive at privacidade@dietkit.jacksonsieben.com. The only
identifier we hold is an email address, so a request from the address on the
account is the check. **Never ask for an identity document** — collecting a
passport scan to prove a right over an email address would gather more sensitive
data than the account contains (GDPR art. 11(2): where we cannot identify the
person, we say so rather than demanding more). If the address does not match an
account, the honest reply is that we hold nothing under it.

| Request | Answer |
| --- | --- |
| **Access** (art. 15 / LGPD art. 18, II) | Almost everything is on their device already: point them at the export screen, which produces the full file. From the server, tell them what exists: the address, whether it is verified, when the account was created, whether sync is on, how many sealed rows and their total size, the consent record's dates and notice version, and the current sessions. We cannot produce the *content* — say why |
| **Portability** (art. 20 / art. 18, V) | The export file. It is JSON, it is complete, and it is generated on the device without us |
| **Rectification** (art. 16 / art. 18, III) | Profile and records are edited in the app. On the server there is nothing to correct except the email address, which they change themselves |
| **Erasure** (art. 17 / art. 18, VI) | The delete screen, `/conta/excluir`, does it in full and at once. If someone asks by email instead, tell them the button exists and offer to do it if they cannot; if we do it, confirm what was removed. Local data is theirs to clear, and the notice says how |
| **Withdraw consent** (art. 7(3) / art. 8, § 5º) | Switching sync off. It deletes the server copy immediately and keeps the account. Never harder than giving it was |
| **Restriction / objection** (arts. 18, 21) | Rare here: there is no profiling and no legitimate-interest processing of content to object to. Handle case by case, and note that switching sync off achieves the practical version in one click |
| **Automated decisions** (art. 22 / art. 20) | None. The energy and macro calculations are arithmetic the person triggers and can see; they produce no decision about the person with legal or similarly significant effects |
| **Complaint** | Say plainly that they may complain to the CNPD in Portugal or the ANPD in Brazil, and include the contact address here first |

Log every request in the same private repository as the incident register: when
it arrived, what it asked for, what was answered, and when. One line each.

---

## Questions for the lawyer

The Brazilian review is a launch gate. These are the questions to send with the
three notices and this file.

1. **Encarregado.** Must one be formally named for Brazilian users at this scale,
   or does the small-processing-agent treatment under Res. CD/ANPD nº 2/2022
   apply given that the data is sensitive? The notices currently name the
   controller as both controller and *encarregado*.
2. **No representative in Brazil.** The LGPD created no equivalent of GDPR
   art. 27, but the ANPD has been receiving complaints against foreign
   controllers with no local presence, and this controller is established in
   Portugal. Is the absence acceptable, and does anything change if Brazilian
   users become the majority?
3. **The age gate.** The terms state 18+ (`Terms.ageBody`, citing Lei n.º
   58/2019, art. 16) and nothing in the product enforces it — there is no
   birth-date question at sign-up, by design. Is a stated minimum sufficient
   for a health-adjacent service, or is a checkbox or a date required, and what
   does the LGPD's treatment of minors demand here?
4. **The three notices as rewritten** — privacy, terms, health — with particular
   attention to: the consent flow for sensitive data (LGPD art. 11, I) and
   whether the pre-consent screen is "specific and highlighted" enough; the
   adequacy argument for EU storage under art. 33, I and Res. CD/ANPD
   nº 32/2026; and the statement that the controller cannot read synced data,
   which is the load-bearing sentence in all three.
5. **The unnamed email sub-processor** (above). Is naming the sender "the
   accounts service's own mailer", with the question filed and the answer
   promised, an acceptable interim disclosure under LGPD art. 9 and GDPR
   art. 13(1)(e)?
6. **This document.** Does the record of processing satisfy art. 37 as a
   Brazilian filing, and is the DPIA adequate as a *relatório de impacto* if the
   ANPD asks for one (art. 38)?

---

## Open items

- [ ] Neon's answer on the email sub-processor, then name it in the notice.
- [ ] File the art. 28 terms and sub-processor lists for Neon and Vercel.
- [ ] Confirm Neon's history-retention window and correct the number here,
      in `Account.deleteLag` and in `Privacy.retentionBackups` if it is not 1 day.
- [ ] Confirm user deletion is enabled for the Neon Auth branches, or the last
      step of account deletion fails and the person is told the registration
      remains.
- [ ] Create the private repository that holds the incident register and the
      request log, so that "one file per incident" is a place and not a plan.
- [ ] The Brazilian lawyer review itself (#99 is the paperwork; the review is
      the gate).
