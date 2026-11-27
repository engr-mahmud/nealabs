import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { requireOrgPage } from "@/features/organizations/current";
import { listClientOptions } from "@/features/clients/service";
import { setSiteArchivedAction } from "@/features/sites/actions";
import { SiteForm } from "@/features/sites/components/site-form";
import { getSite } from "@/features/sites/service";
import { ArchiveForm } from "@/features/master-data/components/archive-form";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Site" };

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrgPage();
  const { id } = await params;
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const site = await getSite(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const clients = await listClientOptions(ctx);
  const archived = !!site.archivedAt;
  const canWrite = canWriteData(ctx);
  const name = (c: { nameEn: string; nameAr: string | null }) => (locale === "ar" && c.nameAr ? c.nameAr : c.nameEn);
  // Keep the current client in the list even if it is archived.
  const options = clients.some((c) => c.id === site.client.id) ? clients : [...clients, site.client];

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={site.name}
        subtitle={name(site.client)}
        action={canWrite ? <ArchiveForm id={site.id} archived={archived} action={setSiteArchivedAction} confirmText={t("sites.archiveConfirm")} /> : null}
      />
      {archived ? <Alert tone="warning">{t("sites.archivedNote")}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <ButtonLink href={`/app/workforce?site=${site.id}`} variant="secondary">
          {t("sites.viewWorkers")} ({site._count.workers})
        </ButtonLink>
        <Link href={`/app/clients/${site.client.id}`} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand hover:underline">
          {name(site.client)}
        </Link>
      </div>
      <SiteForm
        id={site.id}
        values={{ clientId: site.clientId, name: site.name, city: site.city, address: site.address, notes: site.notes }}
        clients={options.map((c) => ({ id: c.id, name: name(c) }))}
        returnTo={`/app/sites/${site.id}`}
        disabled={!canWrite || archived}
      />
    </div>
  );
}
