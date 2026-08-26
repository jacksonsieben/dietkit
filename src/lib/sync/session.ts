import type { Repository } from "@/lib/storage/repository";
import type { IsoTimestamp } from "@/lib/storage/types";

import type { EnrollmentStore } from "./enrollment";
import type { Journal } from "./journal";
import type { SyncOutcome, SyncRepository } from "./repository";
import { seedJournal } from "./seed";
import type { VaultClient } from "./vault-transport.http";
import { createVault, openWithPassphrase, openWithRecoveryCode } from "./vault";

/**
 * Turning sync on, off, and back on somewhere else (#96).
 *
 * Everything under this file already works: the vault wraps a key, the store
 * keeps it, the decorator journals writes, the transport moves sealed rows.
 * What was missing is the order they go in, and the order is the part with the
 * consequences — seed before the first pull and a second device resolves a
 * conflict for every record it owns; drop the local key before the server copy
 * is deleted and nobody can ever read those rows again.
 *
 * So the order lives here, in a plain object with no React in it, and the
 * screen becomes four buttons that call four methods.
 *
 * Nothing here decides *whether* to sync. That is the person's decision, made
 * on `/conta/sincronizar`, and it is recorded as consent in the same call that
 * uploads the vault (§ D23).
 */

export type SyncState =
  /** No vault anywhere: sync has never been turned on for this account. */
  | { readonly status: "off" }
  /**
   * The account syncs, but not from here yet — a second device, or this one
   * after the browser's storage was cleared. Needs the passphrase or the code.
   */
  | {
      readonly status: "elsewhere";
      readonly notice: string;
      readonly consentedAt: IsoTimestamp;
    }
  /** On, on this device. The key is here and the decorator is installed. */
  | {
      readonly status: "on";
      readonly notice: string;
      readonly consentedAt: IsoTimestamp;
    };

export type EnableResult =
  | { readonly outcome: "enabled"; readonly recoveryCode: string }
  /**
   * Somebody got there first — another device turned sync on for this account
   * between this screen loading and this button being pressed. The offered
   * vault was refused rather than written, because writing it would have
   * orphaned every row the other device had already sealed.
   */
  | { readonly outcome: "conflict" };

export interface SyncReadings {
  /** Records written here and not yet accepted by the server. */
  readonly pending: number;
  /** Absent until this device has completed one round trip. */
  readonly lastSyncedAt?: IsoTimestamp;
}

export interface SyncSessionOptions {
  /** From the session cookie, by way of the page. Never guessed here. */
  readonly accountId: string;
  /** `LEGAL_EFFECTIVE_DATE` — the version of the notice that was on screen. */
  readonly notice: string;
  readonly vaults: VaultClient;
  readonly enrollment: EnrollmentStore;
  readonly journal: Journal;
  /** Wraps the device's store; the same seam `src/lib/storage/index.ts` owns. */
  readonly install: (
    wrap: (inner: Repository) => SyncRepository,
  ) => SyncRepository;
  readonly uninstall: () => void;
  /** Builds the decorator. Passed in so this file needs no crypto of its own. */
  readonly decorate: (options: {
    inner: Repository;
    dataKey: CryptoKey;
    deviceId: string;
  }) => SyncRepository;
  readonly deviceId?: () => string;
  readonly now?: () => IsoTimestamp;
}

export interface SyncSession {
  /**
   * What this account and this device currently are.
   *
   * Asks the server only when the device is not enrolled — an enrolled device
   * must be able to say "on" while offline, because the whole point is that
   * sync is a background convenience and never a gate on logging a set.
   */
  state(): Promise<SyncState>;

  /** First device: makes a key, uploads the wrapped copies, records consent. */
  enable(passphrase: string): Promise<EnableResult>;

  /** Second device: opens the existing vault with a passphrase or a code. */
  unlock(secret: { passphrase: string } | { recoveryCode: string }): Promise<{
    readonly outcome: "unlocked" | "off";
  }>;

  /** One round trip. Throws if there is no network or no enrollment. */
  sync(): Promise<SyncOutcome>;

  /**
   * What the readout draws: rows still waiting, and when the last round trip
   * finished. Local, so it answers offline — which is the case it exists for.
   */
  readings(): Promise<SyncReadings>;

  /** Deletes the server copy, then forgets the key. Returns rows deleted. */
  disable(): Promise<{ readonly rows: number }>;
}

export function createSyncSession(options: SyncSessionOptions): SyncSession {
  const { accountId, notice, vaults, enrollment, journal } = options;
  const deviceId = options.deviceId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString() as IsoTimestamp);

  /** The decorator, once installed. Rebuilt on enable, unlock and reload. */
  let repository: SyncRepository | undefined;

  function install(dataKey: CryptoKey, device: string): SyncRepository {
    repository = options.install((inner) =>
      options.decorate({ inner, dataKey, deviceId: device }),
    );
    return repository;
  }

  /**
   * Writes down that this device is in, and starts journalling writes.
   *
   * The consent dates come back from the server rather than being made up
   * here, so that the device and the one row that has to answer for it agree
   * about what was agreed to and when.
   */
  async function adopt(
    dataKey: CryptoKey,
    consent: { notice: string; consentedAt: IsoTimestamp },
  ): Promise<SyncRepository> {
    const device = deviceId();

    await enrollment.write({
      accountId,
      deviceId: device,
      notice: consent.notice,
      consentedAt: consent.consentedAt,
      dataKey,
    });

    return install(dataKey, device);
  }

  /** Everything local, gone: the key, the journal, the decorator. */
  async function forget(): Promise<void> {
    options.uninstall();
    repository = undefined;
    await journal.clear();
    await enrollment.clear();
  }

  return {
    async state(): Promise<SyncState> {
      const local = await enrollment.read();

      if (local && local.accountId !== accountId) {
        // Somebody signed out and into a different account on this device. The
        // old key would seal nothing this account can read and the old journal
        // would push another account's dirty list, so both go.
        await forget();
      } else if (local) {
        // Re-installing on every load is what makes sync survive a refresh:
        // the key is in IndexedDB, the decorator is not.
        if (!repository) install(local.dataKey, local.deviceId);

        return {
          status: "on",
          notice: local.notice,
          consentedAt: local.consentedAt,
        };
      }

      const remote = await vaults.read();
      if (!remote) return { status: "off" };

      return {
        status: "elsewhere",
        notice: remote.notice,
        consentedAt: remote.consentedAt,
      };
    },

    async enable(passphrase: string): Promise<EnableResult> {
      const created = await createVault(passphrase);
      const written = await vaults.write(created.vault, notice);

      if (written.outcome === "conflict") return { outcome: "conflict" };

      const enrolled = await adopt(created.dataKey, written.stored);

      // Everything already on this device becomes something to push. Nothing
      // was written through the decorator before this moment, so without this
      // the second device would receive an account that looks brand new.
      await seedJournal(enrolled, journal, now);

      return { outcome: "enabled", recoveryCode: created.recoveryCode };
    },

    async unlock(secret): Promise<{ outcome: "unlocked" | "off" }> {
      const remote = await vaults.read();
      if (!remote) return { outcome: "off" };

      // Throws `WrongKeyError` on a wrong passphrase or a wrong code, and says
      // nothing else about which — the screen turns that into one sentence.
      const dataKey =
        "passphrase" in secret
          ? await openWithPassphrase(remote.vault, secret.passphrase)
          : await openWithRecoveryCode(remote.vault, secret.recoveryCode);

      const enrolled = await adopt(dataKey, remote);

      // Pull first, then seed, then push what is left. A record that came down
      // in that first pull already has a journal entry, so seeding skips it;
      // seeding first would mark it dirty at a revision this device had never
      // seen and every one of them would come back a conflict.
      await enrolled.sync();
      await seedJournal(enrolled, journal, now);
      await enrolled.sync();

      return { outcome: "unlocked" };
    },

    async sync(): Promise<SyncOutcome> {
      if (!repository) throw new Error("Sync is not on for this device.");

      const outcome = await repository.sync();

      // Stamped only on the way out of a successful round trip. A failed one
      // must leave the old time standing: "last synced Tuesday" is the sentence
      // that tells somebody their phone has not reached the server all week,
      // and a clock that moves on every attempt would never say it.
      const local = await enrollment.read();
      if (local) await enrollment.write({ ...local, lastSyncedAt: now() });

      return outcome;
    },

    async readings(): Promise<SyncReadings> {
      const [waiting, local] = await Promise.all([
        journal.pending(),
        enrollment.read(),
      ]);

      return { pending: waiting.length, lastSyncedAt: local?.lastSyncedAt };
    },

    async disable(): Promise<{ rows: number }> {
      // The server first, always. The other order deletes the only key that
      // opens the rows on the server and leaves them there, unreadable by
      // anybody including the person who wrote them.
      const erased = await vaults.erase();
      await forget();

      return erased;
    },
  };
}
