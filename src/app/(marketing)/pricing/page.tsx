import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PRICES_VALIDATED } from "@/config/plans";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { pricingProps } from "@/features/billing/components/pricing-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.pricing");
  return { title: t("title"), description: t("subtitle") };
}

export default async function PricingPage() {
  const t = await getTranslations("marketing.pricing");
  const pricing = await pricingProps({ cta: t("cta"), extraFeatures: [t("included")] });
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 md:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
        <p className="mt-3 text-lg text-slate-700">{t("subtitle")}</p>
      </div>
      <div className="mt-10">
        <PricingTable plans={pricing.plans} labels={pricing.labels} hrefTemplate="/sign-up" headingLevel="h2" />
      </div>
      <p className="mt-2 text-center text-sm text-slate-600">{t("trialNote")}</p>
      {PRICES_VALIDATED ? null : <p className="mt-1 text-center text-xs text-slate-500">{t("draft")}</p>}
    </section>
  );
}
