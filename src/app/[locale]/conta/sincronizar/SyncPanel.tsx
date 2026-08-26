"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DotText, displayFontSize } from "@/components/dot/DotText";
import { Field } from "@/components/Field";
import { ActionButton, Ghost, Legend, Rule } from "@/components/nd/kit";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";
import { deviceSyncSession } from "@/lib/sync/client";
import { normalizeRecoveryCode } from "@/lib/sync/recovery";
import { WrongKeyError } from "@/lib/sync/sealed";
import type { SyncReadings, SyncState } from "@/lib/sync/session";
import { SyncRequestError } from "@/lib/sync/transport.http";
import { MINIMUM_PASSPHRASE_LENGTH } from "@/lib/sync/vault";

/**
 * The screen where somebody turns sync on, and off (#96).
 *
 * Everything it does is one call into `deviceSyncSession`, which is deliberate:
 * the order the vault, the key, the journal and the server are touched in is
 * decided in `src/lib/sync/session.ts` and tested there against memory doubles.
 * A screen that knew that order would be a second copy of it, and the failures
 * available in this particular order are the ones nobody recovers from.
 *
 * So what is left here is the part a test cannot check — that the page says,
 * before anything leaves the device, exactly what the server is about to learn
 * (docs/DECISIONS.md § D23), where it will sit, and that a forgotten passphrase
 * with a lost recovery code is permanent. Consent that is not informed is not
 * consent, and this is the screen where the informing has to happen.
 *
 * It is colocated under `conta/` rather than living in `src/components/` for
 * the reason `AccountForm.tsx` is: the account screens are the only ones
 * allowed to know an account exists, and a directory is a boundary that stays
 * true on its own.
 */

/** What the panel is drawing. `code` is the one view nothing can return to. */
type View =
  | { kind: "loading" }
  | { kind: "unreachable" }
  | { kind: "expired" }
  | { kind: "off" }
  | { kind: "code"; recoveryCode: string }
  | { kind: "on"; notice: string; consentedAt: string }
  | { kind: "elsewhere"; notice: string; consentedAt: string };

function viewOf(state: SyncState): View {
  return state.status === "off"
    ? { kind: "off" }
    : {
        kind: state.status,
        notice: state.notice,
        consentedAt: state.consentedAt,
      };
}

/**
 * A failure the whole panel has to answer for, rather than one form's message.
 *
 * A 401 is the only one of these that is not about sync at all — the cookie
 * expired while the page was open, and every button on the screen will keep
 * failing until somebody signs in again. Saying "could not sync" to that is how
 * people end up believing their data is stuck.
 */
function fatal(error: unknown): View | undefined {
  if (error instanceof SyncRequestError && error.status === 401) {
    return { kind: "expired" };
  }
  return undefined;
}

export function SyncPanel({ accountId }: { accountId: string }) {
  const t = useTranslations("Sync");
  const format = useFormatter();

  const [view, setView] = useState<View>({ kind: "loading" });
  const [readings, setReadings] = useState<SyncReadings | undefined>(undefined);

  const session = deviceSyncSession(accountId);

  /**
   * What the panel should be showing, asked without touching React.
   *
   * `state()` is local for an enrolled device, so this keeps answering on a
   * plane; it is only the not-yet-enrolled case that has to ask the server, and
   * that case is the one that can come back `unreachable`.
   */
  const read = useCallback(async (): Promise<{
    view: View;
    readings?: SyncReadings;
  }> => {
    try {
      const [state, next] = await Promise.all([
        session.state(),
        session.readings(),
      ]);
      return { view: viewOf(state), readings: next };
    } catch (error) {
      return { view: fatal(error) ?? { kind: "unreachable" } };
    }
  }, [session]);

  /** Where the panel goes back to after anything that changed the answer. */
  const refresh = useCallback(async () => {
    const next = await read();
    setReadings(next.readings);
    setView(next.view);
  }, [read]);

  useEffect(() => {
    // Dropped if the panel has gone by the time the answer lands, and asked
    // outside the render the effect belongs to: nothing here is state React
    // could have derived, because all of it lives in IndexedDB.
    let live = true;

    void (async () => {
      const next = await read();
      if (!live) return;
      setReadings(next.readings);
      setView(next.view);
    })();

    return () => {
      live = false;
    };
  }, [read]);

  const day = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "long" });

  const noticeDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      dateStyle: "long",
      timeZone: "UTC",
    });

  if (view.kind === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (view.kind === "expired") {
    return <p className="text-sm text-nd-red-ink">{t("expired")}</p>;
  }

  if (view.kind === "unreachable") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-nd-red-ink">{t("unreachable")}</p>
        <Ghost type="button" onClick={() => void refresh()}>
          {t("retry")}
        </Ghost>
      </div>
    );
  }

  if (view.kind === "code") {
    return (
      <RecoveryCode code={view.recoveryCode} onKept={() => void refresh()} />
    );
  }

  if (view.kind === "on") {
    return (
      <Readout
        session={session}
        readings={readings}
        consented={day(view.consentedAt)}
        notice={noticeDay(view.notice)}
        onChanged={() => void refresh()}
        onFatal={setView}
      />
    );
  }

  if (view.kind === "elsewhere") {
    return (
      <UnlockForm
        session={session}
        since={day(view.consentedAt)}
        onChanged={() => void refresh()}
        onFatal={setView}
      />
    );
  }

  return (
    <ConsentForm
      session={session}
      notice={noticeDay(LEGAL_EFFECTIVE_DATE)}
      onEnabled={(recoveryCode) => setView({ kind: "code", recoveryCode })}
      onConflict={() => void refresh()}
      onFatal={setView}
    />
  );
}

type Session = ReturnType<typeof deviceSyncSession>;

interface Handlers {
  session: Session;
  onFatal: (view: View) => void;
}

/**
 * The screen before anything has left the device.
 *
 * The list of what the server learns is § D23's three bullets, in the order
 * that section writes them, and it is above the form rather than below it: a
 * disclosure a reader meets after the button is a disclosure that was never
 * made. The acknowledgement checkbox is not legal decoration either — losing
 * both secrets is unrecoverable, and a checkbox is the cheapest way to make
 * somebody read the one sentence that says so.
 */
function ConsentForm({
  session,
  notice,
  onEnabled,
  onConflict,
  onFatal,
}: Handlers & {
  notice: string;
  onEnabled: (recoveryCode: string) => void;
  onConflict: () => void;
}) {
  const t = useTranslations("Sync.off");

  const [passphrase, setPassphrase] = useState("");
  const [repeat, setRepeat] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    if (passphrase.length < MINIMUM_PASSPHRASE_LENGTH) {
      setError(t("short", { length: MINIMUM_PASSPHRASE_LENGTH }));
      return;
    }
    if (passphrase !== repeat) {
      setError(t("mismatch"));
      return;
    }
    if (!acknowledged) {
      setError(t("acknowledgeRequired"));
      return;
    }

    setError(undefined);
    setWorking(true);

    try {
      const result = await session.enable(passphrase);

      if (result.outcome === "conflict") {
        // Another device won the race while this page was open. Nothing was
        // written: the vault it offered was refused rather than overwriting the
        // one whose key already opens rows on the server.
        onConflict();
        return;
      }

      onEnabled(result.recoveryCode);
    } catch (caught) {
      const stop = fatal(caught);
      if (stop) {
        onFatal(stop);
        return;
      }
      setError(t("failed"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("heading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("body")}
        </p>
      </section>

      <Rule />

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("learnsHeading")}</Legend>
        <ul className="flex max-w-prose flex-col gap-1.5 text-sm leading-relaxed">
          <li>{t("learnsAccount")}</li>
          <li>{t("learnsDevices")}</li>
          <li>{t("learnsRows")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("cannotHeading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed">{t("cannotBody")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("whereHeading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("whereBody")}
        </p>
      </section>

      <Rule />

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("warningHeading")}</Legend>
        {/* Red, because this is the one thing on the page that is genuinely
            irreversible. Everything else here can be undone by pressing the
            other button. */}
        <p className="max-w-prose text-sm leading-relaxed text-nd-red-ink">
          {t("warningBody")}
        </p>
      </section>

      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t("passphraseLabel")}
          hint={t("passphraseHint", { length: MINIMUM_PASSPHRASE_LENGTH })}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          )}
        </Field>

        <Field label={t("confirmLabel")} hint={t("confirmHint")}>
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            />
          )}
        </Field>

        <label className="flex max-w-prose items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-1 size-4 shrink-0 border border-nd-ink"
          />
          <span>{t("acknowledgeLabel")}</span>
        </label>

        <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
          {t("consent", { date: notice })}
        </p>

        {error === undefined ? null : (
          <p role="alert" className="max-w-prose text-sm text-nd-red-ink">
            {error}
          </p>
        )}

        <ActionButton type="submit" disabled={working}>
          {working ? t("working") : t("action")}
        </ActionButton>
      </form>
    </div>
  );
}

/**
 * The code, once.
 *
 * Nothing on the device stores it and nothing on the server has ever seen it,
 * so leaving this view is genuinely the last chance. It is drawn as type rather
 * than as a dot panel: this is a string to be copied character by character,
 * and the panel is for numbers to be read across a room.
 */
function RecoveryCode({ code, onKept }: { code: string; onKept: () => void }) {
  const t = useTranslations("Sync.code");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("heading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed">{t("body")}</p>
      </section>

      <div className="flex flex-col gap-2 border-2 border-nd-ink px-4 py-5">
        <Legend>{t("legend")}</Legend>
        <p
          className="text-base leading-relaxed tracking-[0.18em] break-all"
          data-numeric
        >
          {code}
        </p>
      </div>

      <ActionButton type="button" onClick={onKept}>
        {t("action")}
      </ActionButton>
    </div>
  );
}

/**
 * Sync, running.
 *
 * The one lit panel is what is still waiting to go up, because that is the only
 * number on this screen somebody would open it to check: everything else here
 * is a fact about the past. Zero is a reading, not an empty state — an
 * instrument that goes blank when it is level tells you nothing about whether
 * it is working.
 */
function Readout({
  session,
  readings,
  consented,
  notice,
  onChanged,
  onFatal,
}: Handlers & {
  readings: SyncReadings | undefined;
  consented: string;
  notice: string;
  onChanged: () => void;
}) {
  const t = useTranslations("Sync.on");
  const format = useFormatter();

  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirming, setConfirming] = useState(false);
  const [removed, setRemoved] = useState<number | undefined>(undefined);

  const pending = String(readings?.pending ?? 0);

  const run = async (job: () => Promise<void>) => {
    setError(undefined);
    setWorking(true);
    try {
      await job();
    } catch (caught) {
      const stop = fatal(caught);
      if (stop) {
        onFatal(stop);
        return;
      }
      setError(navigator.onLine ? t("failed") : t("offline"));
    } finally {
      setWorking(false);
    }
  };

  const now = () =>
    void run(async () => {
      await session.sync();
      onChanged();
    });

  const off = () =>
    void run(async () => {
      setConfirming(false);
      const { rows } = await session.disable();
      setRemoved(rows);
      onChanged();
    });

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("heading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("consented", { date: consented, notice })}
        </p>
      </section>

      <Rule />

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("pendingLegend")}</Legend>
        <DotText
          className="block"
          style={{ fontSize: displayFontSize(pending) }}
        >
          {pending}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">
          {t("pendingUnit")}
        </p>
        <p className="max-w-prose text-sm text-nd-dim">
          {readings?.pending ? t("waiting") : t("level")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <Legend as="h2">{t("lastLegend")}</Legend>
        <p className="max-w-prose text-sm text-nd-dim">
          {readings?.lastSyncedAt === undefined
            ? t("lastNever")
            : t("lastAt", {
                date: format.dateTime(new Date(readings.lastSyncedAt), {
                  dateStyle: "long",
                  timeStyle: "short",
                }),
              })}
        </p>
      </section>

      <div aria-live="polite" className="flex flex-col gap-2">
        {error === undefined ? null : (
          <p className="max-w-prose text-sm text-nd-red-ink">{error}</p>
        )}
        {removed === undefined ? null : (
          <p className="max-w-prose text-sm">
            {t("removed", { count: removed })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <ActionButton type="button" onClick={now} disabled={working}>
          {working ? t("syncing") : t("sync")}
        </ActionButton>
        <Ghost
          type="button"
          onClick={() => setConfirming(true)}
          disabled={working}
        >
          {t("action")}
        </Ghost>
      </div>

      {confirming ? (
        <ConfirmDialog
          title={t("confirmTitle")}
          confirmLabel={t("confirmAction")}
          cancelLabel={t("confirmCancel")}
          tone="danger"
          onConfirm={off}
          onCancel={() => setConfirming(false)}
        >
          {t("confirmBody")}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * A second device, holding either secret.
 *
 * The passphrase first and the code behind a link, because the code is the
 * thing somebody has to go and find in a drawer. Both fail into one sentence:
 * "that does not open this account" says everything a person can act on, and
 * distinguishing a wrong passphrase from a wrong code would be telling an
 * attacker which of the two they had guessed at.
 */
function UnlockForm({
  session,
  since,
  onChanged,
  onFatal,
}: Handlers & { since: string; onChanged: () => void }) {
  const t = useTranslations("Sync.elsewhere");

  const [byCode, setByCode] = useState(false);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [working, setWorking] = useState(false);

  const submit = async () => {
    setError(undefined);

    // A code of the wrong shape is not a wrong code, and can be said out loud:
    // the format is printed on the page it came from.
    const code = byCode ? normalizeRecoveryCode(secret) : null;
    if (byCode && code === null) {
      setError(t("malformed"));
      return;
    }

    setWorking(true);

    try {
      const result = await session.unlock(
        code === null ? { passphrase: secret } : { recoveryCode: code },
      );

      if (result.outcome === "off") {
        setError(t("vanished"));
        onChanged();
        return;
      }

      onChanged();
    } catch (caught) {
      const stop = fatal(caught);
      if (stop) {
        onFatal(stop);
        return;
      }
      setError(caught instanceof WrongKeyError ? t("wrong") : t("failed"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("heading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("body", { date: since })}
        </p>
        <p className="max-w-prose text-sm leading-relaxed">{t("merge")}</p>
      </section>

      <form
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label={byCode ? t("codeLabel") : t("passphraseLabel")}
          hint={byCode ? t("codeHint") : t("passphraseHint")}
        >
          {(props) => (
            <input
              {...props}
              type={byCode ? "text" : "password"}
              autoComplete={byCode ? "off" : "current-password"}
              // The code is written in one case and typed in whichever the
              // keyboard offers; `normalizeRecoveryCode` settles it either way.
              autoCapitalize="characters"
              spellCheck={false}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          )}
        </Field>

        {error === undefined ? null : (
          <p role="alert" className="max-w-prose text-sm text-nd-red-ink">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ActionButton type="submit" disabled={working}>
            {working ? t("working") : t("action")}
          </ActionButton>
          <Ghost
            type="button"
            onClick={() => {
              setByCode(!byCode);
              setSecret("");
              setError(undefined);
            }}
          >
            {byCode ? t("usePassphrase") : t("useCode")}
          </Ghost>
        </div>
      </form>
    </div>
  );
}
