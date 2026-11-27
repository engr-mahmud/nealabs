import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { ensureFinanceSetup } from "@/features/finance/service";
import { monthlyTrend } from "@/features/reports/service";
import { ReportHeader } from "@/features/reports/components/report-header";

export const metadata: Metadata = { title: "Month by month" };

export default async function MonthlyReportPage() {
  const { ctx } = await requireOrgPage();
  await ensureFinanceSetup(ctx);
  const [t, locale, format, report] = await Promise.all([getTranslations("reports"), getLocale(), getFormatter(), monthlyTrend(ctx, 12)]);
  const money = (h: number) => formatSar(h, locale);
  const max = Math.max(1, ...report.rows.flatMap((r) => [r.income, r.expense]));
  const width = (v: number) => `${v > 0 ? Math.max(1, Math.round((v / max) * 100)) : 0}%`;
  const empty = report.rows.every((r) => r.income === 0 && r.expense === 0);
  // Months before the first income or expense are left out (a new company has a short history).
  const first = report.rows.findIndex((r) => r.income !== 0 || r.expense !== 0);
  const shown = report.rows.slice(Math.max(0, first));
  const monthEnd = (m: Date) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));

  return (
    <>
      <ReportHeader title={t("monthly.title")} subtitle={t("monthly.subtitle")} exportHref={empty ? null : "/api/reports/monthly"} />
      {empty ? (
        <EmptyState
          title={t("monthly.emptyTitle")}
          body={t("monthly.emptyBody")}
          action={canWriteData(ctx) ? <ButtonLink href="/app/finance/new?kind=EXPENSE" size="lg">+ {t("monthly.addEntry")}</ButtonLink> : null}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("monthly.income")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{money(report.totals.income)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("monthly.expense")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{money(report.totals.expense)}</p>
            </div>
            <div className={cn("rounded-xl border bg-white p-4 shadow-sm", report.totals.profit < 0 ? "border-red-200" : "border-emerald-200")}>
              <p className="text-sm text-slate-600">{report.totals.profit < 0 ? t("monthly.loss") : t("monthly.profit")}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", report.totals.profit < 0 ? "text-red-700" : "text-slate-900")}>{money(report.totals.profit)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">{t("monthly.title")}</caption>
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-slate-600">
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("monthly.month")}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">
                    <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-emerald-500" />{t("monthly.income")}</span>
                    <span className="ms-3 inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-slate-400" />{t("monthly.expense")}</span>
                  </th>
                  <th scope="col" className="px-4 py-2 text-end font-medium">{t("monthly.profit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...shown].reverse().map((r) => {
                  const href = `/app/finance/reports?${new URLSearchParams({ from: toDateInput(r.month), to: toDateInput(monthEnd(r.month)) }).toString()}`;
                  return (
                    <tr key={r.month.toISOString()} className="hover:bg-slate-50">
                      <th scope="row" className="px-4 py-3 text-start font-medium whitespace-nowrap">
                        <Link href={href} className="text-slate-900 hover:underline">{format.dateTime(r.month, { month: "long", year: "numeric", timeZone: "UTC" })}</Link>
                      </th>
                      <td className="w-full px-3 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: width(r.income) }} />
                            </div>
                            <span className="w-28 shrink-0 text-end tabular-nums text-slate-800">{money(r.income)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                              <div className="h-full rounded-full bg-slate-400" style={{ width: width(r.expense) }} />
                            </div>
                            <span className="w-28 shrink-0 text-end tabular-nums text-slate-600">{money(r.expense)}</span>
                          </div>
                        </div>
                      </td>
                      <td className={cn("px-4 py-3 text-end font-semibold tabular-nums whitespace-nowrap", r.profit < 0 ? "text-red-700" : "text-slate-900")}>{money(r.profit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">{t("monthly.note")}</p>
        </div>
      )}
    </>
  );
}
