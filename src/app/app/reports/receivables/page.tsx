import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { agingBuckets, receivablesAging } from "@/features/reports/service";
import { ReportHeader } from "@/features/reports/components/report-header";

export const metadata: Metadata = { title: "Money to collect" };

export default async function ReceivablesReportPage() {
  const { ctx } = await requireOrgPage();
  const [t, locale, format, report] = await Promise.all([getTranslations("reports"), getLocale(), getFormatter(), receivablesAging(ctx)]);
  const money = (h: number) => formatSar(h, locale);
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr ? x.nameAr : x.nameEn);
  const { totals } = report;
  const late = totals.d1_30 + totals.d31_60 + totals.d61_90 + totals.d90plus;

  return (
    <>
      <ReportHeader
        title={t("receivables.title")}
        subtitle={t("receivables.subtitle", { date: format.dateTime(report.today, { dateStyle: "medium", timeZone: "UTC" }) })}
        exportHref={report.rows.length > 0 ? "/api/reports/receivables" : null}
      />
      {report.rows.length === 0 ? (
        <EmptyState
          title={t("receivables.emptyTitle")}
          body={t("receivables.emptyBody")}
          action={canWriteData(ctx) ? <ButtonLink href="/app/sales/invoices/new" size="lg">+ {t("receivables.createInvoice")}</ButtonLink> : null}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("receivables.total")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{money(totals.total)}</p>
              <p className="text-sm text-slate-500">{t("receivables.invoices", { count: totals.invoices })}</p>
            </div>
            <div className={cn("rounded-xl border bg-white p-4 shadow-sm", late > 0 ? "border-red-200" : "border-slate-200")}>
              <p className="text-sm text-slate-600">{t("receivables.late")}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", late > 0 ? "text-red-700" : "text-slate-900")}>{money(late)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("receivables.veryLate")}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", totals.d90plus > 0 ? "text-red-700" : "text-slate-900")}>{money(totals.d90plus)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[48rem] text-sm">
              <caption className="sr-only">{t("receivables.title")}</caption>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-600">
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("receivables.client")}</th>
                  {agingBuckets.map((b) => (
                    <th key={b} scope="col" className="px-3 py-2 text-end font-medium">{t(`buckets.${b}`)}</th>
                  ))}
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("receivables.rowTotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.rows.map((r) => (
                  <tr key={r.clientId} className="hover:bg-slate-50">
                    <th scope="row" className="px-4 py-3 text-start font-normal">
                      <Link href={`/app/clients/${r.clientId}`} className="font-medium text-slate-900 hover:underline">{name(r)}</Link>
                      <span className="block text-xs text-slate-500">
                        {t("receivables.invoices", { count: r.invoices })}
                        {r.oldestLateDays > 0 ? ` · ${t("receivables.oldest", { days: r.oldestLateDays })}` : ""}
                      </span>
                    </th>
                    {agingBuckets.map((b) => (
                      <td key={b} className={cn("px-3 py-3 text-end tabular-nums", r.buckets[b] === 0 ? "text-slate-300" : b === "current" ? "text-slate-800" : b === "d1_30" ? "text-amber-800" : "font-medium text-red-700")}>
                        {r.buckets[b] === 0 ? "—" : money(r.buckets[b])}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-end font-semibold tabular-nums text-slate-900">{money(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold">
                  <th scope="row" className="px-4 py-3 text-start">{t("receivables.rowTotal")}</th>
                  {agingBuckets.map((b) => (
                    <td key={b} className="px-3 py-3 text-end tabular-nums">{money(totals[b])}</td>
                  ))}
                  <td className="px-4 py-3 text-end tabular-nums">{money(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t("receivables.note")}</p>
        </div>
      )}
    </>
  );
}
