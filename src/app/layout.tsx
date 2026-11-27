import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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
      <head>
        {/* Fonts are self-hosted in public/fonts (see globals.css). Preloading starts them with the HTML, not after the CSS. */}
        <link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {locale === "ar" ? <link rel="preload" href="/fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" /> : null}
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
