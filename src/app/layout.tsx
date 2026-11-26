import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "./globals.css";
import { brand } from "@/config/brand";
import { isLocale, localeDir } from "@/i18n/config";

export const metadata: Metadata = {
  title: { default: brand.productName, template: `%s · ${brand.productName}` },
  description: brand.tagline.en,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: brand.colors.accent };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "en";
  const brandVars = {
    "--brand-accent": brand.colors.accent,
    "--brand-accent-hover": brand.colors.accentHover,
    "--brand-accent-foreground": brand.colors.accentForeground,
  } as CSSProperties;

  return (
    <html lang={locale} dir={localeDir(locale)} style={brandVars}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
