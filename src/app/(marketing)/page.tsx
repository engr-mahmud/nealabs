import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { PRICES_VALIDATED } from "@/config/plans";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { pricingProps } from "@/features/billing/components/pricing-data";
import { ProductPreview } from "@/features/marketing/components/product-preview";
import { whatsappUrl } from "@/features/marketing/components/site-chrome";
import { WhatsAppIcon } from "@/features/marketing/components/whatsapp-icon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return {
    title: { absolute: t("title", { product: brand.productName }) },
    description: t("description"),
    openGraph: { title: t("title", { product: brand.productName }), description: t("description"), type: "website" },
  };
}

const FEATURES = ["invoices", "workforce", "salaries", "finance", "dashboard", "excel"] as const;
const STEPS = ["one", "two", "three"] as const;
const FAQ = ["trial", "after", "zatca", "arabic", "payment", "data", "change", "team"] as const;

const ICONS: Record<(typeof FEATURES)[number], string> = {
  invoices: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h5",
  workforce: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3",
  salaries: "M3 6h18v12H3zM3 10h18M7 15h3",
  finance: "M3 3v18h18M7 15l4-4 3 3 6-6",
  dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
  excel: "M4 4h16v16H4zM4 9h16M4 14h16M10 4v16",
};

export default async function HomePage() {
  const [t, locale] = await Promise.all([getTranslations("marketing"), getLocale()]);
  const pricing = await pricingProps({ cta: t("pricing.cta"), extraFeatures: [t("pricing.included")] });
  const location = brand.dataLocation;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-brand/[0.06] to-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-semibold text-brand">{t("hero.eyebrow")}</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">{t("hero.title")}</h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-slate-700">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-brand px-6 text-base font-semibold text-brand-foreground shadow-sm hover:bg-brand-hover">
                {t("hero.cta")}
              </Link>
              <Link href="#pricing" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 text-base font-medium text-slate-900 hover:bg-slate-50">
                {t("hero.secondary")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-slate-600">{t("hero.note")}</p>
          </div>
          <ProductPreview />
        </div>
        <ul className="mx-auto grid max-w-6xl gap-3 px-4 pb-10 text-sm text-slate-700 sm:grid-cols-3 sm:px-6">
          {(["qr", "bilingual", "safe"] as const).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <svg aria-hidden viewBox="0 0 20 20" className="size-5 flex-none text-brand" fill="currentColor">
                <path d="M10 1.7a8.3 8.3 0 1 0 0 16.6 8.3 8.3 0 0 0 0-16.6Zm-1.2 12-3.6-3.6 1.2-1.2 2.4 2.4 5-5 1.2 1.2z" />
              </svg>
              {t(`trust.${k}`)}
            </li>
          ))}
        </ul>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-title" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-3xl font-bold tracking-tight text-slate-900">
              {t("features.title")}
            </h2>
            <p className="mt-3 text-lg text-slate-700">{t("features.subtitle")}</p>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f}>
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICONS[f]} />
                  </svg>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(`features.items.${f}.title`)}</h3>
                <p className="mt-2 text-slate-700">{t(`features.items.${f}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section aria-labelledby="steps-title" className="bg-slate-50 py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 id="steps-title" className="text-3xl font-bold tracking-tight text-slate-900">
            {t("steps.title")}
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-2xl border border-slate-200 bg-white p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">{(i + 1).toLocaleString(locale === "ar" ? "ar-SA" : "en")}</span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{t(`steps.items.${s}.title`)}</h3>
                <p className="mt-2 text-slate-700">{t(`steps.items.${s}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="pricing-title" className="text-3xl font-bold tracking-tight text-slate-900">
              {t("pricing.title")}
            </h2>
            <p className="mt-3 text-lg text-slate-700">{t("pricing.subtitle")}</p>
          </div>
          <div className="mt-10">
            <PricingTable plans={pricing.plans} labels={pricing.labels} hrefTemplate="/sign-up" />
          </div>
          <p className="mt-2 text-center text-sm text-slate-600">{t("pricing.trialNote")}</p>
          {PRICES_VALIDATED ? null : <p className="mt-1 text-center text-xs text-slate-500">{t("pricing.draft")}</p>}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 bg-slate-50 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 id="faq-title" className="text-3xl font-bold tracking-tight text-slate-900">
            {t("faq.title")}
          </h2>
          <div className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FAQ.map((q) => (
              <details key={q} className="group px-5 py-1 sm:px-6">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                  {t(`faq.items.${q}.q`)}
                  <svg aria-hidden viewBox="0 0 20 20" className="size-5 flex-none text-slate-500 transition-transform group-open:rotate-180" fill="currentColor">
                    <path d="M5.3 7.3 10 12l4.7-4.7 1.1 1.1L10 14.2 4.2 8.4z" />
                  </svg>
                </summary>
                <p className="pb-5 text-slate-700">{t(`faq.items.${q}.a`, { location })}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" aria-labelledby="contact-title" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-2">
          <div>
            <h2 id="contact-title" className="text-3xl font-bold tracking-tight text-slate-900">
              {t("contact.title")}
            </h2>
            <p className="mt-3 text-lg text-slate-700">{t("contact.body")}</p>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#177a40] px-6 font-semibold text-white hover:bg-[#13693a]">
              <WhatsAppIcon className="size-5" />
              {t("contact.whatsapp")}
            </a>
            <p className="mt-3 text-sm text-slate-600">
              <a href={`mailto:${brand.supportEmail}`} className="underline hover:text-slate-900">
                {t("contact.email", { email: brand.supportEmail })}
              </a>
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900 p-8 text-white">
            <h2 className="text-2xl font-bold">{t("cta.title")}</h2>
            <p className="mt-3 text-slate-300">{t("cta.body")}</p>
            <Link href="/sign-up" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-lg bg-white px-6 font-semibold text-slate-900 hover:bg-slate-100">
              {t("hero.cta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
