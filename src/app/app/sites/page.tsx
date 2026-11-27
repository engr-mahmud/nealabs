import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterSelect, ListToolbar, Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { listClientOptions } from "@/features/clients/service";
import { listSites } from "@/features/sites/service";
import { ListActions } from "@/features/master-data/components/list-actions";
import { param, parseListQuery } from "@/features/master-data/list";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const sp = await searchParams;
  const query = { ...parseListQuery(sp), clientId: param(sp, "client") || undefined };
  const [t, locale, result, clients] = await Promise.all([getTranslations(), getLocale(), listSites(ctx, query), listClientOptions(ctx)]);
  const canWrite = canWriteData(ctx);
  const clientName = (c: { nameEn: string; nameAr: string | null }) => (locale === "ar" && c.nameAr ? c.nameAr : c.nameEn);
  const params: Record<string, string> = {
    ...(query.q ? { q: query.q } : {}),
    ...(query.archived ? { archived: "1" } : {}),
    ...(query.clientId ? { client: query.clientId } : {}),
  };
  const filtered = !!(query.q || query.clientId);

  return (
    <>
      <PageHeader
        title={t("sites.title")}
        subtitle={t("sites.subtitle")}
        action={<ListActions canWrite={canWrite && clients.length > 0} addHref="/app/sites/new" addLabel={t("sites.add")} importHref="/app/sites/import" exportHref={`/api/master-data/sites/export${query.archived ? "?archived=1" : ""}`} />}
      />
      <ListToolbar
        basePath="/app/sites"
        q={query.q}
        archived={query.archived}
        placeholder={t("sites.searchPlaceholder")}
        filters={
          clients.length > 1 ? (
            <FilterSelect name="client" label={t("sites.fields.client")} value={query.clientId ?? ""}>
              <option value="">{t("sites.allClients")}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientName(c)}
                </option>
              ))}
            </FilterSelect>
          ) : null
        }
      />

      {result.total === 0 ? (
        filtered ? (
          <EmptyState title={t("list.noResults")} action={<ButtonLink href="/app/sites" variant="secondary">{t("list.clearSearch")}</ButtonLink>} />
        ) : query.archived ? (
          <EmptyState title={t("sites.emptyArchived")} />
        ) : clients.length === 0 ? (
          <EmptyState title={t("sites.empty.title")} body={t("sites.needClient")} action={canWrite ? <ButtonLink href="/app/clients/new" size="lg">+ {t("clients.add")}</ButtonLink> : null} />
        ) : (
          <EmptyState
            title={t("sites.empty.title")}
            body={t("sites.empty.body")}
            action={
              canWrite ? (
                <>
                  <ButtonLink href="/app/sites/new" size="lg">+ {t("sites.add")}</ButtonLink>
                  <ButtonLink href="/app/sites/import" variant="secondary" size="lg">{t("list.importExcel")}</ButtonLink>
                </>
              ) : null
            }
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((s) => (
            <li key={s.id}>
              <Link href={`/app/sites/${s.id}`} className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{s.name}</p>
                  <p className="truncate text-sm text-slate-500">{[clientName(s.client), s.city].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge>{t("sites.workersCount", { count: s._count.workers })}</Badge>
                  {s.archivedAt ? <Badge tone="warning">{t("common.archivedBadge")}</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination basePath="/app/sites" params={params} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
