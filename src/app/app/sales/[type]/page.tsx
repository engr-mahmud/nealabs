import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { SalesTabs } from "@/features/sales/components/sales-tabs";
import { listSalesDocs, receivablesSummary, type ListStatusFilter } from "@/features/sales/service";
import { displayStatus, statusTone, typeFromSlug, type SalesTypeSlug } from "@/features/sales/status";

export const metadata: Metadata = { title: "Sales" };

const FILTERS: Record<"invoice" | "other", ListStatusFilter[]> = {
  invoice: ["", "draft", "unpaid", "due", "paid"],
  other: ["", "draft", "sent", "converted"],
};

export default async function SalesListPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const slug = (await params).type as SalesTypeSlug;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  const filters = FILTERS[type === "INVOICE" ? "invoice" : "other"];
  const statusParam = param(sp, "status") as ListStatusFilter;
  const status = filters.includes(statusParam) ? statusParam : "";
  const pageNum = Number.parseInt(param(sp, "page"), 10);
  const query = { q: param(sp, "q"), status, page: Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1 };
  const [t, locale, format, result, summary] = await Promise.all([
    getTranslations("sales"),
    getLocale(),
    getFormatter(),
    listSalesDocs(ctx, type, query),
    type === "INVOICE" ? receivablesSummary(ctx) : Promise.resolve(null),
  ]);
  const canWrite = canWriteData(ctx);
  const today = todayInRiyadh();
  const base = `/app/sales/${slug}`;
  const href = (p: Record<string, string>) => {
    const s = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString();
    return s ? `${base}?${s}` : base;
  };
  const done = param(sp, "done");

  return (
    <>
      <SalesTabs current={slug} />
      <PageHeader
        title={t(`types.${slug}.plural`)}
        subtitle={t(`types.${slug}.subtitle`)}
        action={canWrite ? <ButtonLink href={`${base}/new`} size="lg">+ {t(`types.${slug}.new`)}</ButtonLink> : null}
      />
      {done === "deleted" ? <Alert tone="success" className="mb-4">{t("done.deleted")}</Alert> : null}

      {summary && summary.unpaidCount > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Link href={href({ status: "unpaid" })} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300">
            <p className="text-sm text-slate-600">{t("summary.outstanding")}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatSar(summary.outstanding, locale)}</p>
            <p className="text-sm text-slate-500">{t("summary.unpaidCount", { count: summary.unpaidCount })}</p>
          </Link>
          <Link href={href({ status: "due" })} className={cn("rounded-xl border bg-white p-4 shadow-sm", summary.overdueCount ? "border-red-200 hover:border-red-300" : "border-slate-200")}>
            <p className="text-sm text-slate-600">{t("summary.overdue")}</p>
            <p className={cn("mt-1 text-2xl font-semibold", summary.overdueCount ? "text-red-700" : "text-slate-900")}>{summary.overdueCount}</p>
            <p className="text-sm text-slate-500">{t("summary.overdueHint")}</p>
          </Link>
        </div>
      ) : null}

      <div className="mb-4 space-y-3">
        <form method="get" action={base} role="search" className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <label className="sr-only" htmlFor="sales-q">{t("search")}</label>
          <input
            id="sales-q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={t("searchPlaceholder")}
            className="block min-h-11 w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
          <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
            {t("search")}
          </button>
        </form>
        <div className="flex flex-wrap gap-1 text-sm">
          {filters.map((f) => (
            <Link
              key={f || "all"}
              href={href({ q: query.q, status: f })}
              aria-current={f === status ? "true" : undefined}
              className={cn("inline-flex min-h-9 items-center rounded-full px-3 font-medium", f === status ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {t(`filters.${f || "all"}`)}
            </Link>
          ))}
        </div>
      </div>

      {result.total === 0 ? (
        query.q || status ? (
          <EmptyState title={t("noResults")} action={<ButtonLink href={base} variant="secondary">{t("clearFilters")}</ButtonLink>} />
        ) : (
          <EmptyState
            title={t(`types.${slug}.emptyTitle`)}
            body={t(`types.${slug}.emptyBody`)}
            action={canWrite ? <ButtonLink href={`${base}/new`} size="lg">+ {t(`types.${slug}.new`)}</ButtonLink> : null}
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((d) => {
            const st = displayStatus({ ...d, converted: !!d.convertedTo }, today);
            const client = locale === "ar" && d.client.nameAr ? d.client.nameAr : d.client.nameEn;
            const balance = d.total - d.paidAmount;
            return (
              <li key={d.id}>
                <Link href={`${base}/${d.id}`} className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      <span className="ltr-nums">{d.number ?? t("draftNumber")}</span>
                      <span className="text-slate-400"> · </span>
                      {client}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {format.dateTime(d.issueDate, { dateStyle: "medium", timeZone: "UTC" })}
                      {d.site ? ` · ${d.site.name}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-end">
                      <p className="font-semibold tabular-nums text-slate-900">{formatSar(d.total, locale)}</p>
                      {type === "INVOICE" && d.status === "SENT" && balance > 0 && d.paidAmount > 0 ? (
                        <p className="text-xs tabular-nums text-slate-500">{t("balanceShort", { amount: formatSar(balance, locale) })}</p>
                      ) : null}
                    </div>
                    <Badge tone={statusTone[st]}>{t(`status.${st}`)}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath={base} params={Object.fromEntries(Object.entries({ q: query.q, status }).filter(([, v]) => v))} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
