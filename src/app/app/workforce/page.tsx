import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect, ListToolbar, Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { formatSar } from "@/lib/money";
import { requireOrgPage } from "@/features/organizations/current";
import { listSiteOptions } from "@/features/sites/service";
import { listWorkers, type ExpiryFilter } from "@/features/workforce/service";
import { groupSites } from "@/features/workforce/site-groups";
import { ExpiryBadge } from "@/features/master-data/components/expiry-badge";
import { ListActions } from "@/features/master-data/components/list-actions";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { param, parseListQuery } from "@/features/master-data/list";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Workforce" };

export default async function WorkforcePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  const expiryParam = param(sp, "expiry");
  const expiry: ExpiryFilter = expiryParam === "soon" || expiryParam === "expired" ? expiryParam : "";
  const query = { ...parseListQuery(sp), siteId: param(sp, "site") || undefined, expiry };
  const [t, locale, result, sites] = await Promise.all([getTranslations(), getLocale(), listWorkers(ctx, query), listSiteOptions(ctx)]);
  const canWrite = canWriteData(ctx);
  const today = todayInRiyadh();
  const params: Record<string, string> = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.archived ? { archived: "1" } : {}),
    ...(query.siteId ? { site: query.siteId } : {}),
    ...(expiry ? { expiry } : {}),
  };
  const filtered = !!(query.q || query.siteId || expiry);
  const clientName = (c: { nameEn: string; nameAr: string | null }) => (locale === "ar" && c.nameAr ? c.nameAr : c.nameEn);

  return (
    <>
      <PageHeader
        title={t("workers.title")}
        subtitle={t("workers.subtitle")}
        action={<ListActions canWrite={canWrite} addHref="/app/workforce/new" addLabel={t("workers.add")} importHref="/app/workforce/import" exportHref={`/api/master-data/workers/export${query.archived ? "?archived=1" : ""}`} />}
      />
      {param(sp, "saved") ? <Alert tone="success" className="mb-4">{t("workers.saved")}</Alert> : null}
      <ListToolbar
        basePath="/app/workforce"
        q={query.q}
        archived={query.archived}
        placeholder={t("workers.searchPlaceholder")}
        filters={
          <>
            <FilterSelect name="expiry" label={t("workers.columns.documents")} value={expiry}>
              <option value="">{t("workers.expiry.all")}</option>
              <option value="soon">{t("workers.expiry.soon")}</option>
              <option value="expired">{t("workers.expiry.expired")}</option>
            </FilterSelect>
            {sites.length > 0 ? (
              <FilterSelect name="site" label={t("workers.fields.site")} value={query.siteId ?? ""}>
                <option value="">{t("workers.allSites")}</option>
                <option value="none">{t("workers.withoutSite")}</option>
                {groupSites(sites, locale).map((g) => (
                  <optgroup key={g.client} label={g.client}>
                    {g.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </FilterSelect>
            ) : null}
          </>
        }
      />

      {result.total === 0 ? (
        filtered ? (
          <EmptyState title={t("list.noResults")} action={<ButtonLink href="/app/workforce" variant="secondary">{t("list.clearSearch")}</ButtonLink>} />
        ) : query.archived ? (
          <EmptyState title={t("workers.emptyArchived")} />
        ) : (
          <EmptyState
            title={t("workers.empty.title")}
            body={t("workers.empty.body")}
            action={
              canWrite ? (
                <>
                  <ButtonLink href="/app/workforce/new" size="lg">+ {t("workers.add")}</ButtonLink>
                  <ButtonLink href="/app/workforce/import" variant="secondary" size="lg">{t("list.importExcel")}</ButtonLink>
                </>
              ) : null
            }
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((w) => {
            const total = w.basicSalary + w.housingAllowance + w.transportAllowance + w.otherAllowance;
            return (
              <li key={w.id}>
                <Link href={`/app/workforce/${w.id}`} className="grid gap-2 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto] sm:items-center sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {w.name} {w.archivedAt ? <Badge tone="warning">{t("common.archivedBadge")}</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-slate-500">
                      {[w.jobTitle, w.nationality].filter(Boolean).join(" · ")}
                      {w.jobTitle || w.nationality ? " · " : ""}
                      <span className="ltr-nums">•••• {w.iqamaLast4}</span>
                    </p>
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="truncate text-slate-700">{w.site ? w.site.name : <span className="text-slate-400">{t("workers.noSite")}</span>}</p>
                    {w.site ? <p className="truncate text-slate-500">{clientName(w.site.client)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                    <span className="text-sm font-medium text-slate-900">{formatSar(total, locale)}</span>
                    <span className="flex flex-wrap gap-1">
                      <ExpiryBadge label={t("workers.docs.iqama")} date={w.iqamaExpiry} today={today} />
                      <ExpiryBadge label={t("workers.docs.passport")} date={w.passportExpiry} today={today} />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath="/app/workforce" params={params} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
