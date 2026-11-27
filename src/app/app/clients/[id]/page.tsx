import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { requireOrgPage } from "@/features/organizations/current";
import { setClientArchivedAction } from "@/features/clients/actions";
import { ClientForm } from "@/features/clients/components/client-form";
import { getClient } from "@/features/clients/service";
import { clientFormValues } from "@/features/clients/schemas";
import { ArchiveForm } from "@/features/master-data/components/archive-form";
import { canWriteData } from "@/features/master-data/permissions";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { formatSar } from "@/lib/money";
import { listClientDocs } from "@/features/sales/service";
import { displayStatus, statusTone, typeSlugs } from "@/features/sales/status";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { ctx } = await requireOrgPage();
  const { id } = await params;
  const { saved } = await searchParams;
  const t = await getTranslations();
  const client = await getClient(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const archived = !!client.archivedAt;
  const canWrite = canWriteData(ctx);
  const [docs, ts, locale, format] = await Promise.all([listClientDocs(ctx, client.id), getTranslations("sales"), getLocale(), getFormatter()]);
  const today = todayInRiyadh();

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={client.nameEn}
        subtitle={client.nameAr ?? undefined}
        action={canWrite ? <ArchiveForm id={client.id} archived={archived} action={setClientArchivedAction} confirmText={t("clients.archiveConfirm")} /> : null}
      />
      {saved ? <Alert tone="success">{t("clients.saved")}</Alert> : null}
      {archived ? <Alert tone="warning">{t("clients.archivedNote")}</Alert> : null}

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardTitle>{t("clients.sites")}</CardTitle>
          {canWrite && !archived ? (
            <ButtonLink href={`/app/sites/new?clientId=${client.id}`} variant="secondary" size="sm">
              + {t("clients.addSite")}
            </ButtonLink>
          ) : null}
        </div>
        {client.sites.length === 0 ? (
          <p className="text-sm text-slate-600">{t("clients.noSites")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {client.sites.map((s) => (
              <li key={s.id}>
                <Link href={`/app/sites/${s.id}`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg px-1 hover:bg-slate-50">
                  <span className="font-medium text-slate-900">
                    {s.name}
                    {s.city ? <span className="font-normal text-slate-500"> · {s.city}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge>{t("sites.workersCount", { count: s._count.workers })}</Badge>
                    {s.archivedAt ? <Badge tone="warning">{t("common.archivedBadge")}</Badge> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("clients.documents")}</CardTitle>
          {canWrite && !archived ? (
            <div className="flex gap-2">
              <ButtonLink href={`/app/sales/quotations/new?clientId=${client.id}`} variant="secondary" size="sm">
                + {t("clients.newQuotation")}
              </ButtonLink>
              <ButtonLink href={`/app/sales/invoices/new?clientId=${client.id}`} size="sm">
                + {t("clients.newInvoice")}
              </ButtonLink>
            </div>
          ) : null}
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-slate-600">{t("clients.noDocuments")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {docs.map((d) => {
              const st = displayStatus({ ...d, converted: !!d.convertedTo }, today);
              return (
                <li key={d.id}>
                  <Link href={`/app/sales/${typeSlugs[d.type]}/${d.id}`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg px-1 hover:bg-slate-50">
                    <span className="text-sm text-slate-900">
                      {ts(`types.${typeSlugs[d.type]}.singular`)} <span className="ltr-nums font-medium">{d.number ?? ts("draftNumber")}</span>
                      <span className="text-slate-500"> · {format.dateTime(d.issueDate, { dateStyle: "medium", timeZone: "UTC" })}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">{formatSar(d.total, locale)}</span>
                      <Badge tone={statusTone[st]}>{ts(`status.${st}`)}</Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ClientForm id={client.id} values={clientFormValues(client)} disabled={!canWrite || archived} />
    </div>
  );
}
