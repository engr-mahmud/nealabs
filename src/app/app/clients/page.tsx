import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar, Pagination } from "@/components/layout/list-toolbar";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { listClients } from "@/features/clients/service";
import { ListActions } from "@/features/master-data/components/list-actions";
import { parseListQuery } from "@/features/master-data/list";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const query = parseListQuery(await searchParams);
  const [t, locale, result] = await Promise.all([getTranslations(), getLocale(), listClients(ctx, query)]);
  const canWrite = canWriteData(ctx);
  const params: Record<string, string> = { ...(query.q ? { q: query.q } : {}), ...(query.archived ? { archived: "1" } : {}) };

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        subtitle={t("clients.subtitle")}
        action={<ListActions canWrite={canWrite} addHref="/app/clients/new" addLabel={t("clients.add")} importHref="/app/clients/import" exportHref={`/api/master-data/clients/export${query.archived ? "?archived=1" : ""}`} />}
      />
      <ListToolbar basePath="/app/clients" q={query.q} archived={query.archived} placeholder={t("clients.searchPlaceholder")} />

      {result.total === 0 ? (
        query.q ? (
          <EmptyState title={t("list.noResults")} action={<ButtonLink href={query.archived ? "/app/clients?archived=1" : "/app/clients"} variant="secondary">{t("list.clearSearch")}</ButtonLink>} />
        ) : query.archived ? (
          <EmptyState title={t("clients.emptyArchived")} />
        ) : (
          <EmptyState
            title={t("clients.empty.title")}
            body={t("clients.empty.body")}
            action={
              canWrite ? (
                <>
                  <ButtonLink href="/app/clients/new" size="lg">+ {t("clients.add")}</ButtonLink>
                  <ButtonLink href="/app/clients/import" variant="secondary" size="lg">{t("list.importExcel")}</ButtonLink>
                </>
              ) : null
            }
          />
        )
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {result.items.map((c) => {
            const name = locale === "ar" && c.nameAr ? c.nameAr : c.nameEn;
            return (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="flex min-h-16 flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{name}</p>
                    <p className="truncate text-sm text-slate-500">{[c.contactName, c.city].filter(Boolean).join(" · ") || " "}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm text-slate-600">
                    {c.vatNumber ? <span className="ltr-nums">VAT {c.vatNumber}</span> : null}
                    <Badge>{t("clients.sitesCount", { count: c._count.sites })}</Badge>
                    {c.archivedAt ? <Badge tone="warning">{t("common.archivedBadge")}</Badge> : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Pagination basePath="/app/clients" params={params} page={result.page} pageCount={result.pageCount} total={result.total} />
    </>
  );
}
