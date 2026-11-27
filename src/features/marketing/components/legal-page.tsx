import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { LEGAL_REVIEWED, LEGAL_UPDATED, legalDoc, type LegalKind } from "../legal";

export async function LegalPage({ kind }: { kind: LegalKind }) {
  const [t, locale, format] = await Promise.all([getTranslations("marketing.legal"), getLocale(), getFormatter()]);
  const doc = legalDoc(kind, locale === "ar" ? "ar" : "en");
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
      {LEGAL_REVIEWED ? null : <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("draft")}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">{doc.title}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("updated", { date: format.dateTime(LEGAL_UPDATED, { dateStyle: "long" }) })}</p>
      <p className="mt-6 text-lg text-slate-700">{doc.intro}</p>
      {doc.sections.map((s) => (
        <section key={s.heading} className="mt-8">
          <h2 className="text-xl font-semibold text-slate-900">{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p} className="mt-3 leading-7 text-slate-700">
              {p}
            </p>
          ))}
        </section>
      ))}
      <p className="mt-12">
        <Link href="/" className="font-medium text-brand hover:underline">
          {t("back")}
        </Link>
      </p>
    </article>
  );
}
