import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { SiteFooter, SiteHeader, WhatsAppFloat } from "@/features/marketing/components/site-chrome";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("marketing.nav");
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        {t("skip")}
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppFloat />
    </div>
  );
}
