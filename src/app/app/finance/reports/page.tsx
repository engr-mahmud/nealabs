import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { FinanceTabs } from "@/features/finance/components/finance-tabs";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import { parsePeriod, periodParams } from "@/features/finance/period";
import { financeSummary, siteProfitReport, type CategoryRow } from "@/features/finance/report";
import { ensureFinanceSetup } from "@/features/finance/service";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  await ensureFinanceSetup(ctx);
  const period = parsePeriod({ period: param(sp, "period"), from: param(sp, "from"), to: param(sp, "to") }, "this-month");
  const [t, locale, summary, sites] = await Promise.all([getTranslations("finance"), getLocale(), financeSummary(ctx, period), siteProfitReport(ctx, period)]);
  const money = (h: number) => formatSar(h, locale);
  const percent = (bp: number | null) => (bp === null ? "—" : new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "percent", maximumFractionDigits: 1 }).format(bp / 10_000));
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr ? x.nameAr : x.nameEn);
  const keep = periodParams(period, "this-month");
  const entriesHref = (extra: Record<string, string>) => `/app/finance?${new URLSearchParams({ ...keep, ...extra }).toString()}`;
  const empty = summary.income.length === 0 && summary.expense.length === 0;

  const categoryList = (rows: CategoryRow[], total: number, emptyText: string) =>
    rows.length === 0 ? (
      <p className="text-sm text-slate-500">{emptyText}</p>
    ) : (
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.categoryId}>
            <Link href={entriesHref({ kind: r.kind, category: r.categoryId })} className="block rounded-lg hover:bg-slate-50">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-slate-800">{name(r)}</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{money(r.net)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className={cn("h-full rounded-full", r.kind === "INCOME" ? "bg-emerald-500" : "bg-slate-500")} style={{ width: `${total > 0 ? Math.max(2, Math.round((Math.max(0, r.net) / total) * 100)) : 0}%` }} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <FinanceTabs current="reports" />
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")} />
      <div className="mb-5">
        <PeriodPicker basePath="/app/finance/reports" period={period} />
      </div>

      {empty ? (
        <EmptyState
          title={t("reports.emptyTitle")}
          body={t("reports.emptyBody")}
          action={canWriteData(ctx) ? <ButtonLink href="/app/finance/new?kind=EXPENSE" size="lg">+ {t("addExpense")}</ButtonLink> : null}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("reports.income")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-700">{money(summary.incomeNet)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">{t("reports.expense")}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{money(summary.expenseNet)}</p>
            </div>
            <div className={cn("rounded-xl border bg-white p-4 shadow-sm", summary.profit < 0 ? "border-red-200" : "border-emerald-200")}>
              <p className="text-sm text-slate-600">{summary.profit < 0 ? t("reports.loss") : t("reports.profit")}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", summary.profit < 0 ? "text-red-700" : "text-slate-900")}>{money(summary.profit)}</p>
              {summary.marginBp !== null ? <p className="text-sm text-slate-500">{t("reports.margin", { percent: percent(summary.marginBp) })}</p> : null}
            </div>
          </div>

          <Card className="p-0 sm:p-0">
            <div className="px-5 pt-5 sm:px-6">
              <CardTitle className="text-base">{t("reports.sites")}</CardTitle>
              <p className="mt-1 text-sm text-slate-600">{t("reports.sitesSubtitle")}</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50 text-slate-600">
                    <th scope="col" className="px-5 py-2 text-start font-medium sm:px-6">{t("reports.site")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("reports.income")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("reports.expense")}</th>
                    <th scope="col" className="px-3 py-2 text-end font-medium">{t("reports.profit")}</th>
                    <th scope="col" className="px-5 py-2 text-end font-medium sm:px-6">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sites.rows.map((r) => (
                    <tr key={r.siteId ?? "none"} className="hover:bg-slate-50">
                      <th scope="row" className="px-5 py-3 text-start font-normal sm:px-6">
                        <Link href={entriesHref({ site: r.siteId ?? "none" })} className="block">
                          <span className="font-medium text-slate-900">{r.siteId ? r.siteName : t("reports.overhead")}</span>
                          {r.clientName ? <span className="block text-xs text-slate-500">{locale === "ar" && r.clientNameAr ? r.clientNameAr : r.clientName}</span> : null}
                        </Link>
                      </th>
                      <td className="px-3 py-3 text-end tabular-nums text-slate-800">{money(r.income)}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-slate-800">{money(r.expense)}</td>
                      <td className={cn("px-3 py-3 text-end font-semibold tabular-nums", r.profit < 0 ? "text-red-700" : "text-slate-900")}>{money(r.profit)}</td>
                      <td className="px-5 py-3 text-end tabular-nums text-slate-600 sm:px-6">{percent(r.marginBp)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <th scope="row" className="px-5 py-3 text-start sm:px-6">{t("reports.total")}</th>
                    <td className="px-3 py-3 text-end tabular-nums">{money(sites.totals.income)}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{money(sites.totals.expense)}</td>
                    <td className={cn("px-3 py-3 text-end tabular-nums", sites.totals.profit < 0 ? "text-red-700" : "text-slate-900")}>{money(sites.totals.profit)}</td>
                    <td className="px-5 py-3 text-end tabular-nums text-slate-600 sm:px-6">{percent(sites.totals.marginBp)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle className="mb-4 text-base">
                {t("reports.income")} · {t("reports.byCategory")}
              </CardTitle>
              {categoryList(summary.income, summary.incomeNet, t("reports.noIncome"))}
            </Card>
            <Card>
              <CardTitle className="mb-4 text-base">
                {t("reports.expense")} · {t("reports.byCategory")}
              </CardTitle>
              {categoryList(summary.expense, summary.expenseNet, t("reports.noExpense"))}
            </Card>
          </div>

          <Card>
            <CardTitle className="mb-3 text-base">{t("reports.vatTitle")}</CardTitle>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">{t("reports.vatCollected")}</dt>
                <dd className="font-medium tabular-nums text-slate-900">{money(summary.vat.collected)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("reports.vatPaid")}</dt>
                <dd className="font-medium tabular-nums text-slate-900">{money(summary.vat.paid)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t("reports.vatNet")}</dt>
                <dd className="font-medium tabular-nums text-slate-900">{money(summary.vat.net)}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{t("reports.vatNote")}</p>
          </Card>
        </div>
      )}
    </>
  );
}
