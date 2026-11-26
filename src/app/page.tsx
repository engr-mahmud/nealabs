import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { getSession } from "@/features/auth/session";

// Placeholder home page. The full marketing site is built in step 7.
export default async function HomePage() {
  if (await getSession()) redirect("/app");
  const t = await getTranslations("home");
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-4">
        <BrandMark />
        <div className="flex items-center gap-1">
          <LanguageSwitch />
          <ButtonLink href="/sign-in" variant="ghost">
            {t("signIn")}
          </ButtonLink>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-xl text-lg text-pretty text-slate-600">{t("subtitle")}</p>
        <ButtonLink href="/sign-up" size="lg" className="mt-8">
          {t("cta")}
        </ButtonLink>
        <p className="mt-3 text-sm text-slate-500">{t("noCard")}</p>
      </main>
    </div>
  );
}
