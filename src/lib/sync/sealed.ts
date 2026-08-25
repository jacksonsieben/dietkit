/**
 * The two primitives everything else in sync is built on (#94).
 *
 * `seal` and `open` are the whole of the claim in the privacy notice. If they
 * are right, the server holds bytes it cannot read; if they are wrong, every
 * other sentence about encryption is decoration. So they live in their own
 * file, with no imports, and are tested before anything calls them.
 *
 * **AES-256-GCM**, because it authenticates as well as encrypts. A server that
 * flipped a byte of ciphertext would, with a plain stream cipher, hand the
 * device a plausible-looking wrong number; with GCM the tag fails and the
 * record simply does not open. Silent corruption of a training log is worse
 * than a visible failure, and this is the difference between the two.
 *
 * **A fresh nonce for every single write.** GCM does not degrade gracefully on
 * nonce reuse — two records sealed with the same key and the same nonce leak
 * their XOR and, worse, the authentication key itself. There is no nonce
 * counter here and no nonce parameter: the only way to get one is
 * `crypto.getRandomValues`, on every call, with no way for a caller to supply
 * their own by accident. 96 bits at random, which is what GCM is specified for.
 *
 * Web Crypto only. No dependency, and the same code runs on the device and in
 * a test — this file must never learn about IndexedDB, Postgres or React.
 */

/**
 * A record as it is stored: two opaque strings and nothing else.
 *
 * Base64url rather than base64 so these survive a URL, a JSON file and a
 * Postgres `text` column without escaping. The column names match
 * `src/lib/db/boundary.test.ts` — `ciphertext` and `nonce` are two of the nine
 * words the sync schema is allowed to use.
 */
export interface Sealed {
  /** 96 random bits, unique to this write. */
  readonly nonce: string;
  /** The record, with GCM's 128-bit tag appended by Web Crypto. */
  readonly ciphertext: string;
}

/**
 * Why a record did not open, and the only answer this module ever gives.
 *
 * A wrong passphrase, a wrong recovery code, a truncated blob and a server that
 * edited a byte all fail here identically, on purpose. Distinguishing them
 * would tell whoever is guessing which half of the guess was right.
 */
export class WrongKeyError extends Error {
  constructor() {
    super("wrong key, or the bytes are not what they were");
    this.name = "WrongKeyError";
  }
}

const NONCE_BYTES = 12;

/** AES-256. Generated on the device, never sent, never derived from an email. */
export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts one record.
 *
 * `context` is additional authenticated data: it is not stored and not secret,
 * but the record will only open when the same string is supplied again. #95
 * passes the row's identity, so a server that moved a blob from one record to
 * another produces a failure rather than a weight showing up as a training set.
 * Optional because the vault (`vault.ts`) has no identity to bind to yet.
 */
export async function seal(
  key: CryptoKey,
  plaintext: string,
  context?: string,
): Promise<Sealed> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    params(nonce, context),
    key,
    new TextEncoder().encode(plaintext),
  );

  return { nonce: encode(nonce), ciphertext: encode(ciphertext) };
}

/** Decrypts one record, or throws `WrongKeyError`. Never returns garbage. */
export async function open(
  key: CryptoKey,
  sealed: Sealed,
  context?: string,
): Promise<string> {
  let plaintext: ArrayBuffer;

  try {
    plaintext = await crypto.subtle.decrypt(
      params(decode(sealed.nonce), context),
      key,
      decode(sealed.ciphertext) as BufferSource,
    );
  } catch {
    // Web Crypto throws a bare `OperationError` for a failed tag and a
    // `DataError` for a malformed input. Both mean the same thing to a caller.
    throw new WrongKeyError();
  }

  return new TextDecoder().decode(plaintext);
}

function params(nonce: Uint8Array, context?: string): AesGcmParams {
  return {
    name: "AES-GCM",
    iv: nonce as BufferSource,
    ...(context === undefined
      ? {}
      : { additionalData: new TextEncoder().encode(context) }),
  };
}

/**
 * Base64url, written out rather than taken from a dependency: `Buffer` is not
 * in a browser and `btoa` is in both.
 */
export function encode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // In chunks, because `String.fromCharCode(...view)` on a long record is a
  // stack overflow rather than a slow path.
  let binary = "";
  for (let i = 0; i < view.length; i += 8192) {
    binary += String.fromCharCode(...view.subarray(i, i + 8192));
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function decode(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
