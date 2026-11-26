import { getLocale, getTranslations } from "next-intl/server";
import { setLocaleAction } from "@/features/i18n/actions";
import { cn } from "@/lib/cn";

export async function LanguageSwitch({ className }: { className?: string }) {
  const locale = await getLocale();
  const t = await getTranslations("common");
  const next = locale === "ar" ? "en" : "ar";
  return (
    <form action={setLocaleAction} className={className}>
      <input type="hidden" name="locale" value={next} />
      <button
        type="submit"
        lang={next}
        className={cn("min-h-10 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100")}
      >
        {t("switchLanguage")}
      </button>
    </form>
  );
}
