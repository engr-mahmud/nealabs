import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { brand } from "@/config/brand";
import { getSession } from "@/features/auth/session";
import { WhatsAppIcon } from "./whatsapp-icon";

export const whatsappUrl = `https://wa.me/${brand.whatsappNumber}`;

export async function SiteHeader() {
  const [t, session] = await Promise.all([getTranslations("marketing.nav"), getSession()]);
  const link = "rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900";
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
        <BrandMark />
        <nav aria-label={t("menu")} className="hidden items-center gap-1 md:flex">
          <Link href="/#features" className={link}>
            {t("features")}
          </Link>
          <Link href="/#pricing" className={link}>
            {t("pricing")}
          </Link>
          <Link href="/#faq" className={link}>
            {t("faq")}
          </Link>
          <Link href="/#contact" className={link}>
            {t("contact")}
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          {session ? (
            <Link href="/app" className="inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
              {t("openApp")}
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="hidden min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:inline-flex">
                {t("signIn")}
              </Link>
              <Link href="/sign-up" className="inline-flex min-h-10 items-center rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground hover:bg-brand-hover sm:px-4">
                {t("startTrial")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const [t, tn] = await Promise.all([getTranslations("marketing.footer"), getTranslations("marketing.nav")]);
  const link = "text-slate-600 hover:text-slate-900 hover:underline";
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <BrandMark />
          <p className="max-w-xs text-sm text-slate-600">{brand.supportEmail}</p>
        </div>
        <nav aria-label={t("legalNav")} className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/pricing" className={link}>
            {t("pricing")}
          </Link>
          <Link href="/terms" className={link}>
            {t("terms")}
          </Link>
          <Link href="/privacy" className={link}>
            {t("privacy")}
          </Link>
          <Link href="/refund" className={link}>
            {t("refund")}
          </Link>
          <Link href="/sign-in" className={link}>
            {tn("signIn")}
          </Link>
        </nav>
      </div>
      <div className="border-t border-slate-100">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">{t("rights", { year: new Date().getFullYear(), brand: brand.umbrellaName })}</p>
      </div>
    </footer>
  );
}

/** Small floating WhatsApp button, always within thumb reach on phones. */
export async function WhatsAppFloat() {
  const t = await getTranslations("marketing.contact");
  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("whatsapp")}
      className="fixed end-4 bottom-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-[#177a40] text-white shadow-lg hover:bg-[#13693a] sm:end-6 sm:bottom-6"
    >
      <WhatsAppIcon className="size-7" />
    </a>
  );
}
