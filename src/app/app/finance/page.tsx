import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect, Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { FinanceTabs } from "@/features/finance/components/finance-tabs";
import { PeriodPicker } from "@/features/finance/components/period-picker";
import { entryQueryParams, parseEntryQuery } from "@/features/finance/query";
import { ensureFinanceSetup, listCategories, listEntries, siteFilterOptions } from "@/features/finance/service";

export const metadata: Metadata = { title: "Finance" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function FinancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  await ensureFinanceSetup(ctx);
  const query = parseEntryQuery(sp);
  const { kind, period } = query;
  const [t, locale, format, result, categories, sites] = await Promise.all([
    getTranslations("finance"),
    getLocale(),
    getFormatter(),
    listEntries(ctx, query),
    listCategories(ctx),
    siteFilterOptions(ctx),
  ]);
  const canWrite = canWriteData(ctx);
  const money = (h: number) => formatSar(h, locale);
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr ? x.nameAr : x.nameEn);
  const base = "/app/finance";
  const filters = entryQueryParams(query);
  const href = (p: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries({ ...filters, ...p }).filter(([, v]) => v)).toString();
    return s ? `${base}?${s}` : base;
  };
  const withoutPeriod = Object.fromEntries(Object.entries(filters).filter(([k]) => !["period", "from", "to"].includes(k)));
  const hasFilters = !!(kind || query.categoryId || query.siteId || query.q);
  const net = result.totals.income - result.totals.expense;
  const done = param(sp, "done");

  return (
    <>
      <FinanceTabs current="transactions" />
      <PageHeader
        title={t("tabs.transactions")}
        subtitle={t("subtitle")}
        action={
          canWrite ? (
            <div className="flex gap-2">
              <ButtonLink href="/app/finance/new?kind=INCOME" variant="secondary" size="lg" className="flex-1 sm:flex-none">
                + {t("addIncome")}
              </ButtonLink>
              <ButtonLink href="/app/finance/new?kind=EXPENSE" size="lg" className="flex-1 sm:flex-none">
                + {t("addExpense")}
              </ButtonLink>
            </div>
          ) : null
        }
      />
      {done === "saved" ? <Alert tone="success" className="mb-4">{t("done.saved")}</Alert> : null}

      <div className="mb-4 space-y-3">
        <PeriodPicker basePath={base} period={period} keep={withoutPeriod} />
        <form method="get" action={base} role="search" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {Object.entries(filters)
            .filter(([k]) => ["period", "from", "to", "voided", "kind"].includes(k))
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label className="sr-only" htmlFor="finance-q">
            {t("searchPlaceholder")}
          </label>
          <input
            id="finance-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={t("searchPlaceholder")}
            className="block min-h-11 w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none sm:min-w-64"
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
          <FilterSelect name="category" label={t("fields.categoryId")} value={query.categoryId}>
            <option value="">{t("allCategories")}</option>
            {categories
              .filter((c) => !kind || c.kind === kind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {name(c)}
                  {kind ? "" : ` (${t(`kinds.${c.kind}`)})`}
                </option>
              ))}
          </FilterSelect>
          <FilterSelect name="site" label={t("fields.siteId")} value={query.siteId}>
            <option value="">{t("allSites")}</option>
            <option value="none">{t("noSite")}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {name(s.client)}
              </option>
            ))}
          </FilterSelect>
          </div>
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            {t("reports.apply")}
          </button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 text-sm">
            {(["", "INCOME", "EXPENSE"] as const).map((k) => (
              <Link
                key={k || "all"}
                href={href({ kind: k, category: "", page: "" })}
                aria-current={k === kind ? "true" : undefined}
                className={cn("inline-flex min-h-9 items-center rounded-full px-3 font-medium", k === kind ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                {t(`kindFilter.${k || "all"}`)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 text-sm">
            <Link href={href({ voided: query.voided ? "" : "1", page: "" })} className="inline-flex min-h-9 items-center rounded-full px-3 font-medium text-slate-600 hover:bg-slate-100">
              {query.voided ? t("hideVoided") : t("showVoided")}
            </Link>
            <a href={`/api/finance/export?${new URLSearchParams(filters).toString()}`} className={buttonClass("ghost", "sm")}>
              {t("export")}
            </a>
          </div>
        </div>
      </div>

      {!query.voided ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
          {(
            [
              ["income", result.totals.income, "text-emerald-700"],
              ["expense", result.totals.expense, "text-slate-900"],
              ["net", net, net < 0 ? "text-red-700" : "text-slate-900"],
            ] as const
          ).map(([key, value, tone]) => (
            <div key={key} className="flex items-baseline justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:block sm:p-4">
              <p className="text-sm text-slate-600">
                {t(`totals.${key}`)} <span className="text-slate-400">· {t("totals.inclVat")}</span>
              </p>
              <p className={cn("text-lg font-semibold tabular-nums sm:mt-1 sm:text-2xl", tone)}>{money(value)}</p>
            </div>
          ))}
        </div>
      ) : null}

      {result.total === 0 ? (
        hasFilters || query.voided ? (
          <EmptyState title={t("noResults")} action={<ButtonLink href={base} variant="secondary">{t("clearFilters")}</ButtonLink>} />
        ) : (
          <EmptyState
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={
              canWrite ? (
                <>
                  <ButtonLink href="/app/finance/new?kind=EXPENSE" size="lg">+ {t("addExpense")}</ButtonLink>
                  <ButtonLink href="/app/sales/invoices" variant="secondary" size="lg">{t("openInvoice")}</ButtonLink>
                </>
              ) : null
            }
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((e) => {
            const income = e.kind === "INCOME";
            const signed = income ? e.amount : -e.amount;
            return (
              <li key={e.id}>
                <Link href={`${base}/${e.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {name(e.category)}
                      {e.description ? <span className="font-normal text-slate-600"> · <span className="ltr-nums">{e.description}</span></span> : null}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {format.dateTime(e.date, { dateStyle: "medium", timeZone: "UTC" })}
                      {e.site ? ` · ${e.site.name}` : ""}
                      {e.client && !e.site ? ` · ${name(e.client)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className={cn("font-semibold tabular-nums", e.voidedAt ? "text-slate-400 line-through" : signed >= 0 ? "text-emerald-700" : "text-slate-900")} dir="ltr">
                      {signed >= 0 ? "+" : "−"}
                      {money(Math.abs(signed))}
                    </p>
                    {e.voidedAt ? <Badge tone="danger">{t("voided")}</Badge> : e.source !== "MANUAL" ? <Badge tone="brand">{t(`sources.${e.source}`)}</Badge> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath={base} params={filters} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
