"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

/**
 * Fired by Chromium before it shows its own install affordance. Not in the DOM
 * lib because it is not a standard: no Firefox, no Safari.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Survives a reload, so a "no thanks" is not asked again on the next visit. */
const DISMISSED_KEY = "dietkit:install-dismissed";

/**
 * Subscribes to nothing: the answer this component reads from the store is
 * "am I in a browser", which is settled before the first paint and never
 * changes again.
 */
const NEVER_CHANGES = () => () => {};

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, predating the media query.
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

function isIos() {
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipod/i.test(ua) ||
    // iPadOS 13+ claims to be a Mac; the touch points give it away.
    (/ipad|macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1)
  );
}

function wasDismissed() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem(DISMISSED_KEY) === "1"
  );
}

/**
 * Offers to install the app, instead of leaving it to whatever the browser
 * does on its own.
 *
 * Next's own PWA guide advises against `beforeinstallprompt`, and it is right
 * that the event is Chromium-only — but the alternative it implies is silence
 * on every browser, which is worse. So both halves are here: Chromium's prompt
 * is intercepted and fired from a button the app owns, and iOS Safari, which
 * has no equivalent API and never will, is told where Apple put the control.
 *
 * Every condition here depends on something the server cannot know — which
 * browser this is, whether the app is already installed, whether the offer was
 * turned down once before. Reading that through `useSyncExternalStore` keeps
 * the server and the hydrating client agreeing on the same empty output, and
 * lets the real answer be computed in the render right after instead of chased
 * with a state update from an effect.
 */
export function InstallPrompt() {
  const t = useTranslations("Install");
  const inBrowser = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [installed, setInstalled] = useState(false);
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppresses Chromium's mini-infobar so there is one offer, not two.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // `isStandalone` reads `window`, so the browser check has to come first.
  if (inBrowser === false || dismissed || installed || isStandalone()) {
    return null;
  }

  // Chromium's offer if it made one; otherwise the instructions are only worth
  // showing where there is no API to make the offer with.
  const showsPrompt = promptEvent !== null;
  if (!showsPrompt && !isIos()) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    // The event is single-use whichever way it goes: firing it again throws.
    setPromptEvent(null);
    setDismissed(true);
  };

  return (
    <aside className="border-t-2 border-nd-ink px-6 py-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium tracking-[0.08em] uppercase">
            {t("title")}
          </p>
          <p className="text-xs text-nd-dim">
            {showsPrompt ? t("body") : t("iosBody")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {showsPrompt ? (
            <button
              type="button"
              onClick={install}
              className="nd-invert bg-nd-ink px-4 py-2 text-xs font-medium tracking-[0.08em] text-nd-ground uppercase"
            >
              {t("action")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-nd-dim underline underline-offset-4"
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </aside>
  );
}
