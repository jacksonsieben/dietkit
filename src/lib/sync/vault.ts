import { generateRecoveryCode, normalizeRecoveryCode } from "./recovery";
import {
  WrongKeyError,
  decode,
  encode,
  open,
  seal,
  type Sealed,
} from "./sealed";

/**
 * The key, and the two ways back to it (#94).
 *
 * One data key per account, generated on the first device. Everything in
 * `sync.rows` is sealed with it, and it is stored nowhere: what the server
 * holds is the same 32 bytes encrypted twice, once under a key derived from the
 * passphrase and once under a key derived from the recovery code. Both blobs,
 * the salt and the KDF parameters are public. Neither opens without something
 * only the person has.
 *
 * **Two wrappings rather than one** because both alternatives are bad. A
 * passphrase alone means a forgotten word destroys years of logs. A key the
 * server can recover means the privacy notice has to say "we can read your data
 * if we choose to", and then none of this was worth building.
 *
 * **Wrapping rather than re-encrypting** is what makes changing a passphrase
 * cheap: the data key never changes, so a rewrap touches 32 bytes instead of
 * every record ever synced. It also means the recovery code survives a
 * passphrase change — losing one does not invalidate the other.
 *
 * **PBKDF2-HMAC-SHA256, 600 000 iterations**, which is OWASP's current figure
 * for this construction, rather than Argon2id, which is better and is a WASM
 * dependency this project will not take (docs/DECISIONS.md § D25). The honest
 * version: PBKDF2 makes a weak passphrase expensive rather than impossible, and
 * the recovery code is the branch where the security actually is.
 *
 * The one thing this file must never grow is a way to send any of it anywhere.
 * There is no column for a passphrase on the server and there is not going to
 * be one (§ D23).
 */

/** Stamped into every vault, so a future format is recognised rather than misread. */
export const VAULT_VERSION = 1;

/**
 * OWASP's figure for PBKDF2-HMAC-SHA256, stored per vault rather than assumed,
 * so that raising it later is a rewrap and not a format change.
 */
export const KDF_ITERATIONS = 600_000;

/**
 * The shortest passphrase this app will seal an account with.
 *
 * Longer than the sign-in password's eight (`src/lib/auth/contract.ts`), and
 * the difference is not fussiness: a forgotten sign-in password is an email
 * away from being reset, and a forgotten passphrase with a lost recovery code
 * is a year of logs nobody can ever open again. PBKDF2 at 600 000 iterations
 * makes a short passphrase expensive to guess rather than impossible, so the
 * length is the other half of that number.
 *
 * A count of characters rather than a rule about which ones. Four ordinary
 * words are both stronger and more memorable than `Xk9$q!`, and a policy that
 * demands a symbol is a policy that gets written on a sticky note.
 */
export const MINIMUM_PASSPHRASE_LENGTH = 12;

const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * What the server keeps. Every field here is safe to hand to anybody: it is the
 * public half of the design, and the point of writing it down as a type is that
 * a field which does not belong becomes visible in a diff.
 */
export interface Vault {
  readonly version: number;
  /** Named rather than assumed, so a vault written by a future version says which. */
  readonly kdf: "PBKDF2-SHA256";
  readonly iterations: number;
  /** Per account, random, not secret. Stops one precomputation covering everybody. */
  readonly salt: string;
  /** The data key, under the passphrase. */
  readonly passphrase: Sealed;
  /** The same data key, under the recovery code. */
  readonly recovery: Sealed;
}

export interface CreatedVault {
  readonly vault: Vault;
  /**
   * Shown once, on the device, and never again. It is not in the vault and
   * cannot be recovered from it — which is the entire point of it existing.
   */
  readonly recoveryCode: string;
  readonly dataKey: CryptoKey;
}

/**
 * Separates the two derivations, so a passphrase that happened to equal a
 * recovery code would still produce two different wrapping keys. Costs a string
 * concatenation and removes a question nobody should have to think about again.
 */
type Purpose = "passphrase" | "recovery";

/**
 * The expensive step, exported because a test pins its output: these parameters
 * are the difference between a passphrase that takes centuries to guess and one
 * that takes an afternoon, and they must not drift silently.
 */
export async function deriveBits(
  secret: string,
  purpose: Purpose,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`dietkit/v1/${purpose} ${secret}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

type Parameters = Pick<Vault, "salt" | "iterations">;

async function wrappingKey(
  secret: string,
  purpose: Purpose,
  parameters: Parameters,
): Promise<CryptoKey> {
  const bits = await deriveBits(
    secret,
    purpose,
    decode(parameters.salt),
    parameters.iterations,
  );

  return crypto.subtle.importKey(
    "raw",
    bits as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * The data key is `extractable`, which is deliberate rather than an oversight:
 * rewrapping it on a passphrase change means exporting it. It never leaves this
 * module in the clear and never leaves the device at all.
 */
async function importDataKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", true, [
    "encrypt",
    "decrypt",
  ]);
}

async function wrap(dataKey: CryptoKey, under: CryptoKey): Promise<Sealed> {
  return seal(under, encode(await crypto.subtle.exportKey("raw", dataKey)));
}

async function unwrap(sealed: Sealed, under: CryptoKey): Promise<CryptoKey> {
  return importDataKey(decode(await open(under, sealed)));
}

/**
 * Here rather than on the screen, because the screen is not the only caller and
 * a length rule that lives in a form is a length rule until somebody writes a
 * second form.
 */
function refuseShort(passphrase: string): void {
  if (passphrase.length < MINIMUM_PASSPHRASE_LENGTH) {
    throw new RangeError(
      `A sync passphrase must be at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`,
    );
  }
}

/** Refuses a vault this version does not understand, rather than guessing at it. */
function understood(vault: Vault): void {
  if (vault.version !== VAULT_VERSION || vault.kdf !== "PBKDF2-SHA256") {
    throw new Error(
      `This account's key was written by a newer DietKit (format ` +
        `${vault.version}/${vault.kdf}). Update the app before syncing.`,
    );
  }
}

/** Turning sync on, on the first device. Everything else follows from this call. */
export async function createVault(passphrase: string): Promise<CreatedVault> {
  refuseShort(passphrase);

  const recoveryCode = generateRecoveryCode();
  const dataKey = await importDataKey(
    crypto.getRandomValues(new Uint8Array(KEY_BITS / 8)),
  );

  const parameters: Parameters = {
    salt: encode(crypto.getRandomValues(new Uint8Array(SALT_BYTES))),
    iterations: KDF_ITERATIONS,
  };

  return {
    vault: {
      version: VAULT_VERSION,
      kdf: "PBKDF2-SHA256",
      ...parameters,
      passphrase: await wrap(
        dataKey,
        await wrappingKey(passphrase, "passphrase", parameters),
      ),
      // Normalised on the way in, so the code opens the vault however it is
      // later typed: lower case, without the hyphens, with an l for a 1.
      recovery: await wrap(
        dataKey,
        await wrappingKey(
          normalizeRecoveryCode(recoveryCode) ?? recoveryCode,
          "recovery",
          parameters,
        ),
      ),
    },
    recoveryCode,
    dataKey,
  };
}

/** Signing in on a second device. Throws `WrongKeyError` and says nothing else. */
export async function openWithPassphrase(
  vault: Vault,
  passphrase: string,
): Promise<CryptoKey> {
  understood(vault);

  return unwrap(
    vault.passphrase,
    await wrappingKey(passphrase, "passphrase", vault),
  );
}

/**
 * The way back when the passphrase is gone. A code that is not a code at all
 * fails exactly like a code that is merely wrong: the caller gets
 * `WrongKeyError` either way, and `normalizeRecoveryCode` is where a screen goes
 * for the more helpful "that is not 25 characters" answer.
 */
export async function openWithRecoveryCode(
  vault: Vault,
  code: string,
): Promise<CryptoKey> {
  understood(vault);

  const normalized = normalizeRecoveryCode(code);
  if (normalized === null) throw new WrongKeyError();

  return unwrap(
    vault.recovery,
    await wrappingKey(normalized, "recovery", vault),
  );
}

/**
 * A new passphrase over the same data. The recovery blob is copied across
 * untouched — changing a passphrase is not a reason to reprint a code that is
 * already written down somewhere safe.
 *
 * Takes the current passphrase rather than a data key, so the only way to call
 * it is to already be able to open the vault.
 *
 * **The salt stays.** Rotating it here would be free security theatre with a
 * real cost: the recovery blob was wrapped under the old salt and cannot be
 * rewrapped, because the code that would derive its key was printed once and
 * nobody here has it. A new salt would silently orphan the only way back.
 */
export async function changePassphrase(
  vault: Vault,
  current: string,
  next: string,
): Promise<Vault> {
  refuseShort(next);
  const dataKey = await openWithPassphrase(vault, current);

  return {
    ...vault,
    passphrase: await wrap(
      dataKey,
      await wrappingKey(next, "passphrase", vault),
    ),
  };
}
