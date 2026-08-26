import { beforeAll, describe, expect, it } from "vitest";

import { decode, encode, open, seal, WrongKeyError } from "./sealed";
import {
  KDF_ITERATIONS,
  VAULT_VERSION,
  changePassphrase,
  createVault,
  deriveBits,
  openWithPassphrase,
  openWithRecoveryCode,
  type CreatedVault,
  type Vault,
} from "./vault";

/**
 * A vault is created once here and shared, because creating one costs two
 * PBKDF2 derivations and the whole point of the parameters is that they are
 * slow. The tests that need their own still make one.
 */

const PASSPHRASE = "roxo cavalo bateria grampo";

let created: CreatedVault;

beforeAll(async () => {
  created = await createVault(PASSPHRASE);
});

/**
 * Whether two data keys are the same key, asked the only way a `CryptoKey`
 * allows: seal with one and open with the other.
 */
async function sameKey(a: CryptoKey, b: CryptoKey): Promise<boolean> {
  try {
    return (await open(b, await seal(a, "82,4"))) === "82,4";
  } catch {
    return false;
  }
}

/**
 * The error a call rejected with, typed, so its message can be compared. A call
 * that does not reject comes back as a plain `Error`, which fails the
 * `WrongKeyError` assertion rather than passing quietly.
 */
async function refusal(attempt: Promise<unknown>): Promise<Error> {
  return attempt.then(
    () => new Error("this was supposed to fail, and did not"),
    (error: unknown) => error as Error,
  );
}

describe("the key derivation", () => {
  it("still produces the bits it produced when this was written", async () => {
    // A vector, not a roundtrip. Change the hash, the iteration count, the
    // domain prefix or the way the passphrase is encoded and this stops
    // matching — and every vault already on the server stops opening.
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);

    expect(
      encode(
        await deriveBits(
          "correct horse battery staple",
          "passphrase",
          salt,
          KDF_ITERATIONS,
        ),
      ),
    ).toBe("JIZyd-TDmvrZ8jymdp7VY9sTweXnd8L-HR-_4Vgk-Xc");
  });

  it("costs what OWASP asks for PBKDF2-HMAC-SHA256", () => {
    expect(KDF_ITERATIONS).toBe(600_000);
  });

  it("derives a different key for the recovery code than for the passphrase", async () => {
    // So that the two wrappings stay independent even in the absurd case where
    // somebody's passphrase is their recovery code.
    const salt = Uint8Array.from({ length: 16 }, () => 7);
    const [passphrase, recovery] = await Promise.all([
      deriveBits("same secret", "passphrase", salt, 1_000),
      deriveBits("same secret", "recovery", salt, 1_000),
    ]);

    expect(encode(passphrase)).not.toBe(encode(recovery));
  });

  it("derives a different key for every account", async () => {
    const [first, second] = await Promise.all([
      deriveBits("same secret", "passphrase", new Uint8Array(16), 1_000),
      deriveBits(
        "same secret",
        "passphrase",
        Uint8Array.from({ length: 16 }, () => 1),
        1_000,
      ),
    ]);

    expect(encode(first)).not.toBe(encode(second));
  });
});

describe("creating a vault", () => {
  it("records the format it was written in, so a future one can be recognised", () => {
    expect(created.vault).toMatchObject({
      version: VAULT_VERSION,
      kdf: "PBKDF2-SHA256",
      iterations: KDF_ITERATIONS,
    });
  });

  it("holds neither the passphrase nor the recovery code", () => {
    // This object is what the server gets. Everything in it is public, and the
    // way to keep it that way is to look.
    const stored = JSON.stringify(created.vault);

    expect(stored).not.toContain(PASSPHRASE);
    expect(stored).not.toContain(created.recoveryCode);
    expect(stored).not.toContain(created.recoveryCode.replaceAll("-", ""));
  });

  it("wraps a key nobody chose", async () => {
    // 256 bits from the system generator, not stretched from a passphrase: the
    // passphrase's job is to wrap this, never to be it.
    const other = await createVault(PASSPHRASE);

    expect(await sameKey(created.dataKey, other.dataKey)).toBe(false);
    expect(created.vault.salt).not.toBe(other.vault.salt);
    expect(decode(created.vault.salt)).toHaveLength(16);
  });
});

describe("opening a vault", () => {
  it("gives back the data key when the passphrase is right", async () => {
    const dataKey = await openWithPassphrase(created.vault, PASSPHRASE);

    expect(await sameKey(created.dataKey, dataKey)).toBe(true);
  });

  it("gives back the same data key for the recovery code", async () => {
    // The two ways in are two wrappings of one key, not two keys. If this ever
    // stopped being true, records written on one device would be unreadable on
    // the other.
    const dataKey = await openWithRecoveryCode(
      created.vault,
      created.recoveryCode,
    );

    expect(await sameKey(created.dataKey, dataKey)).toBe(true);
  });

  it("accepts the recovery code however it was typed", async () => {
    const dataKey = await openWithRecoveryCode(
      created.vault,
      created.recoveryCode.toLowerCase().replaceAll("-", " "),
    );

    expect(await sameKey(created.dataKey, dataKey)).toBe(true);
  });

  it("refuses a wrong passphrase, the same way every time", async () => {
    const failures = await Promise.all([
      refusal(openWithPassphrase(created.vault, "roxo cavalo bateria grampos")),
      refusal(openWithPassphrase(created.vault, "")),
      refusal(
        openWithRecoveryCode(created.vault, "4TQ9K-M0XZW-B7HGF-2VNPR-S3DCJ"),
      ),
      // Not a code at all fails identically to a wrong one: the shape of the
      // guess is the caller's business, and `normalizeRecoveryCode` is where a
      // screen goes for a kinder answer.
      refusal(openWithRecoveryCode(created.vault, "nope")),
    ]);

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(WrongKeyError);
      expect(failure.message).toBe(failures[0]?.message);
    }
  });

  it("refuses a vault written by a version that does not exist yet", async () => {
    // Guessing at an unknown format is how a rewrap turns into a data loss.
    const future: Vault = { ...created.vault, version: VAULT_VERSION + 1 };

    await expect(openWithPassphrase(future, PASSPHRASE)).rejects.toThrow(
      /newer DietKit/,
    );
  });
});

describe("the length rule", () => {
  it("refuses a passphrase too short to be worth guessing at", async () => {
    // Eleven characters, one under the floor. The failure is loud rather than
    // a warning, because there is no "reset passphrase" path anywhere in this
    // design: a weak one here is a weak one until the account is deleted.
    await expect(createVault("curta demais")).resolves.toBeTruthy();
    await expect(createVault("curta demai")).rejects.toThrow(RangeError);
  });

  it("applies the same floor to a change of passphrase", async () => {
    await expect(
      changePassphrase(created.vault, PASSPHRASE, "curta demai"),
    ).rejects.toThrow(RangeError);
  });
});

describe("changing the passphrase", () => {
  let changed: Vault;

  beforeAll(async () => {
    changed = await changePassphrase(
      created.vault,
      PASSPHRASE,
      "outra frase longa",
    );
  });

  it("keeps the data key, so nothing has to be re-encrypted", async () => {
    expect(
      await sameKey(
        created.dataKey,
        await openWithPassphrase(changed, "outra frase longa"),
      ),
    ).toBe(true);
  });

  it("stops the old passphrase working", async () => {
    await expect(openWithPassphrase(changed, PASSPHRASE)).rejects.toThrow(
      WrongKeyError,
    );
  });

  it("leaves the recovery code alone", async () => {
    // Changing a passphrase is not a reason to reprint a code that is already
    // written down somewhere safe. It is also the reason the salt is kept: the
    // recovery blob cannot be rewrapped, because nobody here has the code.
    expect(changed.salt).toBe(created.vault.salt);
    expect(changed.recovery).toEqual(created.vault.recovery);

    expect(
      await sameKey(
        created.dataKey,
        await openWithRecoveryCode(changed, created.recoveryCode),
      ),
    ).toBe(true);
  });

  it("needs the current passphrase, not just the vault", async () => {
    await expect(
      changePassphrase(created.vault, "não é essa", "outra frase longa"),
    ).rejects.toThrow(WrongKeyError);
  });
});
