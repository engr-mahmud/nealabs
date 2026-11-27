import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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

      <ClientForm id={client.id} values={clientFormValues(client)} disabled={!canWrite || archived} />
    </div>
  );
}
