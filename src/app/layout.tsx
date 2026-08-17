import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DietKit",
    template: "%s · DietKit",
  },
  description:
    "Calculadora de dieta local-first: seus dados corporais viram metas de energia e uma dieta montada com a tabela TACO, sem sair do seu aparelho.",
  applicationName: "DietKit",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

// pt-BR is hardcoded until the i18n library lands (#8); it is the only shipped
// locale either way — see docs/DECISIONS.md § D5.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
