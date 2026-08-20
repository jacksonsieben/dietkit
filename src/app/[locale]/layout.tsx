import { SerwistProvider } from "@serwist/next/react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AppChrome } from "@/components/AppChrome";
import { BackupReminder } from "@/components/BackupReminder";
import { InstallPrompt } from "@/components/InstallPrompt";
import { SourceFooter } from "@/components/SourceFooter";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: { default: t("titleDefault"), template: t("titleTemplate") },
    description: t("description"),
    applicationName: "DietKit",
    // iOS decides from this — not from the manifest — whether a home-screen
    // launch opens in its own window or bounces back into Safari.
    appleWebApp: { capable: true, title: "DietKit" },
  };
}

export const viewport: Viewport = {
  // Follows the page rather than the manifest. `globals.css` switches the
  // background on `prefers-color-scheme`, and a single dark value here would
  // paint a black browser toolbar above a white page in light mode. The
  // manifest stays dark on both counts, because the splash screen it describes
  // is continuous with the icon, which has a dark ground of its own.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const locale = resolveLocale((await params).locale);

  // Opts this request into static rendering; without it every page under the
  // segment silently becomes dynamic.
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
        DIRECTION CONTRACT — the world this app is drawn in, written down so a
        later change is a decision rather than a drift.

        THESIS: an instrument, not a document. This app reports the state of one
        person's body and one day's plan, and an instrument shows quantity as
        light: lamps that are on or off, digits built from dots, a rule where a
        card would be.

        OWN-WORLD: Nothing OS, pinned by the user. Two values — ground and ink —
        and one red, spent only where something has gone past its target. Every
        intermediate tone is dot density, never grey fill and never opacity. The
        dot-matrix face is built here in `components/dot/`, on a 5x7 cell, because
        Ndot and NType82 are proprietary and cannot ship; the pictograms are drawn
        on that same grid so the tab bar and the headline share one grammar.

        STORY: the loop. Target, then how far the plan has got with it, then the
        body that says whether any of it is working. Reading order is the order
        of the loop; everything outside the loop is one tab away, in `/mais`.

        FIRST VIEWPORT: the day's energy target, in dots, larger than anything
        else on the screen by a wide margin; three glyph strips under it; the
        name plate above and the five slots below.

        FORM: hard edges, no radius, no shadow, no gradient. Rules, not cards.
        Selection is an inversion of the ground, never a tint. State is carried
        at least twice — by light and by words — because this gets read at arm's
        length in bad kitchen and gym light, and colour may never be the only
        carrier. One authored motion: a pulse crossing the unlit segments of a
        macro that is short, stilled under `prefers-reduced-motion`.

        FINISH: unreviewed and undocumented is unfinished; this build ends with
        the finish review, the verdict, DESIGN.md, and every shipping raster
        carrying its provenance.
      */}
        <NextIntlClientProvider>
          {/* Registers `public/sw.js`, built by `serwist build` after the Next
              build. Off outside production: `next dev` never produces the file,
              and a service worker left installed from an earlier `npm start`
              would serve yesterday's app over today's dev server. */}
          <SerwistProvider
            swUrl="/sw.js"
            disable={process.env.NODE_ENV !== "production"}
            // Default is to reload the page the moment the network returns.
            // Everything the user types lands in IndexedDB on this device, and
            // a reload underneath a half-filled form is a good way to lose it.
            reloadOnOnline={false}
          >
            {/* The three strips live inside the chrome rather than after it:
                the tab bar is fixed, and anything outside the padded column
                would sit underneath it. */}
            <AppChrome>
              {children}
              <BackupReminder />
              <InstallPrompt />
              {/* Not per page — see SourceFooter. The TACO licence condition
                  holds for every screen, so the credit lives where every screen
                  gets it. */}
              <SourceFooter />
            </AppChrome>
          </SerwistProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
