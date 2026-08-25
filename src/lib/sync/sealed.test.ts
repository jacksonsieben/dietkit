import { describe, expect, it } from "vitest";

import {
  WrongKeyError,
  decode,
  encode,
  generateDataKey,
  open,
  seal,
} from "./sealed";

/**
 * These tests are the privacy notice's evidence. "The server stores bytes it
 * cannot read" is a claim about this file and nothing else, so the interesting
 * cases here are the failures: a wrong key, an edited byte, a reused nonce.
 * A roundtrip passing proves only that the code is symmetric.
 */

/**
 * A vector rather than a roundtrip: the key, the nonce and the ciphertext were
 * produced once and written down here. A change of algorithm, of encoding, or
 * of the order the tag is appended in stops opening it, which is exactly the
 * kind of change that would otherwise pass every roundtrip test in this file
 * while making every record already on the server unreadable.
 */
const VECTOR = {
  key: "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw",
  nonce: "yMfGxcTDwsHAv769",
  ciphertext: "FATJJ5unyZStgA7_-0y5HUyuqSQ",
  withContext: "FATJJ9ft_smZEVljtCgUVf2ypgU",
  context: "weights:2026-08-25",
  plaintext: "82,4",
};

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

async function vectorKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    decode(VECTOR.key) as BufferSource,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}

describe("sealing a record", () => {
  it("opens a record sealed by an earlier version of this file", async () => {
    await expect(
      open(await vectorKey(), {
        nonce: VECTOR.nonce,
        ciphertext: VECTOR.ciphertext,
      }),
    ).resolves.toBe(VECTOR.plaintext);
  });

  it("comes back as what went in, accents and all", async () => {
    const key = await generateDataKey();
    const plaintext = JSON.stringify({
      food: "Feijão carioca, cozido",
      grams: 120.5,
    });

    await expect(open(key, await seal(key, plaintext))).resolves.toBe(
      plaintext,
    );
  });

  it("never repeats a nonce", async () => {
    // GCM does not degrade on nonce reuse, it collapses: two records under one
    // key and one nonce give up their XOR and the authentication key with it.
    const key = await generateDataKey();
    const writes = await Promise.all(
      Array.from({ length: 500 }, () => seal(key, "same plaintext every time")),
    );

    expect(new Set(writes.map((write) => write.nonce)).size).toBe(
      writes.length,
    );
  });

  it("does not produce the same ciphertext twice for the same record", async () => {
    // Otherwise the server learns that a value went back to what it was before,
    // without ever reading it.
    const key = await generateDataKey();
    const [first, second] = await Promise.all([
      seal(key, "82,4"),
      seal(key, "82,4"),
    ]);

    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});

describe("a record that cannot be trusted", () => {
  it("refuses a key that is not the one it was sealed with", async () => {
    const sealed = await seal(await generateDataKey(), "82,4");

    await expect(open(await generateDataKey(), sealed)).rejects.toThrow(
      WrongKeyError,
    );
  });

  it("fails on the tag rather than decrypting to something else", async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, "82,4");

    const bytes = decode(sealed.ciphertext);
    bytes[0] ^= 0x01;

    await expect(
      open(key, { ...sealed, ciphertext: encode(bytes) }),
    ).rejects.toThrow(WrongKeyError);
  });

  it("refuses an edited nonce too", async () => {
    const key = await generateDataKey();
    const sealed = await seal(key, "82,4");

    const nonce = decode(sealed.nonce);
    nonce[0] ^= 0x01;

    await expect(
      open(key, { ...sealed, nonce: encode(nonce) }),
    ).rejects.toThrow(WrongKeyError);
  });

  it("says the same thing however it failed", async () => {
    // A caller must not be able to tell "wrong passphrase" from "somebody
    // edited this row" — that difference is a hint to whoever is guessing.
    const key = await generateDataKey();
    const sealed = await seal(key, "82,4");
    const bytes = decode(sealed.ciphertext);
    bytes[0] ^= 0x01;

    const failures = await Promise.all([
      refusal(open(await generateDataKey(), sealed)),
      refusal(open(key, { ...sealed, ciphertext: encode(bytes) })),
      refusal(open(key, { ...sealed, ciphertext: "not base64url at all!!" })),
    ]);

    for (const failure of failures) {
      expect(failure).toBeInstanceOf(WrongKeyError);
      expect(failure.message).toBe(failures[0]?.message);
    }
  });
});

describe("binding a record to where it came from", () => {
  it("opens a record sealed with a context by an earlier version of this file", async () => {
    await expect(
      open(
        await vectorKey(),
        { nonce: VECTOR.nonce, ciphertext: VECTOR.withContext },
        VECTOR.context,
      ),
    ).resolves.toBe(VECTOR.plaintext);
  });

  it("refuses a record that arrived under somebody else's name", async () => {
    // The server cannot read a row, but it can move one. Without this, a blob
    // from `weights` could be served back as a training set.
    const key = await generateDataKey();
    const sealed = await seal(key, "82,4", "weights:2026-08-25");

    await expect(open(key, sealed, "weights:2026-08-24")).rejects.toThrow(
      WrongKeyError,
    );
    await expect(open(key, sealed)).rejects.toThrow(WrongKeyError);
  });
});

describe("base64url", () => {
  it("produces something a URL, a JSON file and a text column all survive", async () => {
    const sealed = await seal(await generateDataKey(), "82,4");

    expect(sealed.ciphertext).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sealed.nonce).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("survives a record far longer than the argument limit", async () => {
    // `String.fromCharCode(...bytes)` on a whole training history is a stack
    // overflow, not a slow path, so the encoder works in chunks.
    // In chunks, because `getRandomValues` refuses more than 64 KiB at once.
    const bytes = new Uint8Array(200_000);
    for (let at = 0; at < bytes.length; at += 65_536) {
      crypto.getRandomValues(bytes.subarray(at, at + 65_536));
    }

    expect(decode(encode(bytes))).toEqual(bytes);
  });

  it("roundtrips the empty record", async () => {
    const key = await generateDataKey();

    await expect(open(key, await seal(key, ""))).resolves.toBe("");
  });
});
