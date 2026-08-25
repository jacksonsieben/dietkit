/**
 * The recovery code (#94).
 *
 * The passphrase is chosen by a person and is therefore worth guessing; this is
 * not. It is 125 bits from the system's random number generator, shown once,
 * and it is where the real entropy in the design lives — 600 000 rounds of
 * PBKDF2 buy time against a weak passphrase, but nothing brute-forces this.
 *
 * Which makes the alphabet the interesting decision, because a code that cannot
 * be read off a piece of paper a year later is a code that loses somebody their
 * data. **Crockford's base32**: no `I`, no `L`, no `O`, no `U`. The first three
 * are the ones that get confused with `1` and `0` in handwriting, and reading
 * accepts them anyway rather than being right and unhelpful. `U` is left out so
 * that no randomly generated code can spell something the person then has to
 * read out to somebody else.
 *
 * Grouped in fives, hyphenated, because that is how anybody who has ever copied
 * a licence key expects to copy one, and because it makes "I lost my place"
 * recoverable. The hyphens are decoration: reading ignores them, along with
 * spaces, line breaks and whatever else a paste brings with it.
 */

/** 32 symbols, so one random byte masked to five bits is exactly one symbol. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const GROUP = 5;
const GROUPS = 5;

/** 25 symbols x 5 bits. Well past the 128-bit key it protects being the weak part. */
const LENGTH = GROUP * GROUPS;

/**
 * Confusions the eye makes, resolved the way the person who wrote it down
 * meant. Not a courtesy: `1` and `l` are the same pen stroke in most
 * handwriting, and refusing the code would be technically correct and
 * practically a data loss.
 */
const CONFUSIONS = new Map([
  ["I", "1"],
  ["L", "1"],
  ["O", "0"],
]);

/** `4TQ9K-...`, printed once and never stored anywhere this code can reach. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
  const symbols = Array.from(bytes, (byte) => ALPHABET[byte & 31]).join("");

  return Array.from({ length: GROUPS }, (_, group) =>
    symbols.slice(group * GROUP, (group + 1) * GROUP),
  ).join("-");
}

/**
 * What was typed, reduced to what was generated — or `null` when it cannot be.
 *
 * `null` means "that is not a recovery code", which a screen may say out loud:
 * the format is printed on the page it came from, so there is nothing to leak.
 * It does not mean "wrong code" — only a failed unwrap knows that.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const symbols = [...input.toUpperCase().replaceAll(/[\s-]/g, "")].map(
    (character) => CONFUSIONS.get(character) ?? character,
  );

  if (symbols.length !== LENGTH) return null;
  if (symbols.some((symbol) => !ALPHABET.includes(symbol))) return null;

  return symbols.join("");
}
