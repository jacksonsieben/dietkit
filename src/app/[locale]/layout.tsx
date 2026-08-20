import { SerwistProvider } from "@serwist/next/react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";

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
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
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
            {children}
            <BackupReminder />
            <InstallPrompt />
            {/* Not per page — see SourceFooter. The TACO licence condition holds
                for every screen, so the credit lives where every screen gets it. */}
            <SourceFooter />
          </SerwistProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
