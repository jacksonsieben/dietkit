import type { IsoTimestamp } from "@/lib/storage/types";

/**
 * What this device remembers about being enrolled in sync (#96).
 *
 * Five fields, and the interesting one is the last. `dataKey` is the *unwrapped*
 * key, held in IndexedDB as a `CryptoKey` — which sounds alarming and is not,
 * for a reason worth writing down rather than assuming:
 *
 * The plaintext records are already in this IndexedDB. Profile, weights, diets
 * and sessions all sit there unencrypted, because that is what a local-first app
 * is. Anything with read access to the database can read them directly; the key
 * adds no exposure it did not already have. What storing it buys is that the
 * passphrase is asked once per device instead of at every launch, and a sync
 * that asked for a passphrase every morning would be a sync people turn off.
 *
 * A `CryptoKey` is structured-cloneable, so it survives the round trip through
 * IndexedDB without ever being serialised to bytes this code could log by
 * accident. `vault.ts` imports it extractable — rewrapping on a passphrase
 * change needs `exportKey` — so this is not a hardware-backed guarantee and is
 * not claimed as one.
 *
 * Turning sync off clears this row (#96). So does signing out on this device.
 */

export interface Enrollment {
  /** Whose account this device is syncing. Compared against the session. */
  readonly accountId: string;
  /** This device, generated here and never sent anywhere legible. */
  readonly deviceId: string;
  /** The `LEGAL_EFFECTIVE_DATE` of the notice that was agreed to. */
  readonly notice: string;
  readonly consentedAt: IsoTimestamp;
  /**
   * When the last round trip finished, for the readout to show (#96).
   *
   * Absent until the first one completes. Kept here rather than on the server
   * because it is a fact about this device, and § D23 already lets the server
   * know when the account last synced -- it does not need to be asked.
   */
  readonly lastSyncedAt?: IsoTimestamp;
  /** The account's data key, unwrapped. Never leaves this device. */
  readonly dataKey: CryptoKey;
}

export interface EnrollmentStore {
  read(): Promise<Enrollment | undefined>;
  write(enrollment: Enrollment): Promise<void>;
  clear(): Promise<void>;
}

/** The store, in memory. Used by the tests and by nothing that ships. */
export function createMemoryEnrollmentStore(): EnrollmentStore {
  let held: Enrollment | undefined;

  return {
    async read() {
      return held;
    },
    async write(enrollment: Enrollment) {
      held = enrollment;
    },
    async clear() {
      held = undefined;
    },
  };
}
