import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect, Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { monthLabel } from "@/features/payroll/documents";
import { PayrollTabs } from "@/features/payroll/components/payroll-tabs";
import { listSheets } from "@/features/payroll/service";

export const metadata: Metadata = { title: "Salaries" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  const q = param(sp, "q");
  const yearParam = Number.parseInt(param(sp, "year"), 10);
  const year = Number.isFinite(yearParam) ? yearParam : null;
  const statusParam = param(sp, "status");
  const status = statusParam === "DRAFT" || statusParam === "APPROVED" ? statusParam : "";
  const pageParam = Number.parseInt(param(sp, "page"), 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const [t, locale, format, result] = await Promise.all([getTranslations("payroll"), getLocale(), getFormatter(), listSheets(ctx, { q, year, status, page })]);
  const canWrite = canWriteData(ctx);
  const lang = locale === "ar" ? "ar" : "en";
  const filters = Object.fromEntries(Object.entries({ q, year: year ? String(year) : "", status }).filter(([, v]) => v));
  const hasFilters = Object.keys(filters).length > 0;
  const done = param(sp, "done");

  return (
    <>
      <PayrollTabs current="sheets" />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          canWrite ? (
            <ButtonLink href="/app/payroll/new" size="lg" className="w-full sm:w-auto">
              + {t("newSheet")}
            </ButtonLink>
          ) : null
        }
      />
      {done === "deleted" ? <Alert tone="success" className="mb-4">{t("done.deleted")}</Alert> : null}

      {result.total > 0 || hasFilters ? (
        <form method="get" action="/app/payroll" role="search" className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="payroll-q">
            {t("searchPlaceholder")}
          </label>
          <input
            id="payroll-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            className="block min-h-11 w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none sm:min-w-64"
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <FilterSelect name="year" label={t("fields.year")} value={year ? String(year) : ""}>
              <option value="">{t("allYears")}</option>
              {result.years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect name="status" label={t("fields.status")} value={status}>
              <option value="">{t("allStatuses")}</option>
              <option value="DRAFT">{t("status.DRAFT")}</option>
              <option value="APPROVED">{t("status.APPROVED")}</option>
            </FilterSelect>
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            {t("apply")}
          </button>
        </form>
      ) : null}

      {result.total === 0 ? (
        hasFilters ? (
          <EmptyState title={t("noResults")} action={<ButtonLink href="/app/payroll" variant="secondary">{t("clearFilters")}</ButtonLink>} />
        ) : (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} action={canWrite ? <ButtonLink href="/app/payroll/new" size="lg">+ {t("newSheet")}</ButtonLink> : null} />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((s) => (
            <li key={s.id}>
              <Link href={`/app/payroll/${s.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {monthLabel(s.year, s.month, lang)}
                    <span className="font-normal text-slate-600"> · {s.site?.name ?? t("allSites")}</span>
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {t("workerCount", { count: s.workerCount })}
                    {s.payDate ? ` · ${t("paidOn", { date: format.dateTime(s.payDate, { dateStyle: "medium", timeZone: "UTC" }) })}` : ""}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="font-semibold text-slate-900 tabular-nums">{formatSar(s.totalNet, locale)}</p>
                  <Badge tone={s.status === "APPROVED" ? "success" : "warning"}>{t(`status.${s.status}`)}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/app/payroll" params={filters} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
