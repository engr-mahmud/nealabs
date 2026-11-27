import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { halalasToInput, toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { listSiteOptions } from "@/features/sites/service";
import { setWorkerArchivedAction } from "@/features/workforce/actions";
import { RevealNumber } from "@/features/workforce/components/reveal-number";
import { WorkerForm } from "@/features/workforce/components/worker-form";
import { getWorker } from "@/features/workforce/service";
import { groupSites } from "@/features/workforce/site-groups";
import { ArchiveForm } from "@/features/master-data/components/archive-form";
import { ExpiryBadge } from "@/features/master-data/components/expiry-badge";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Worker" };

export default async function WorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrgPage();
  const { id } = await params;
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const worker = await getWorker(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const sites = await listSiteOptions(ctx);
  const archived = !!worker.archivedAt;
  const canWrite = canWriteData(ctx);
  const today = todayInRiyadh();
  // Keep the worker's current site in the list even if that site was archived.
  const siteOptions = worker.site && !sites.some((s) => s.id === worker.site!.id) ? [...sites, { id: worker.site.id, name: worker.site.name, client: worker.site.client }] : sites;

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title={worker.name}
        subtitle={[worker.jobTitle, worker.nationality].filter(Boolean).join(" · ") || undefined}
        action={canWrite ? <ArchiveForm id={worker.id} archived={archived} action={setWorkerArchivedAction} confirmText={t("workers.archiveConfirm")} /> : null}
      />
      {archived ? <Alert tone="warning">{t("workers.archivedNote")}</Alert> : null}

      <Card className="space-y-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">{t("workers.fields.iqamaNumber")}</dt>
            <dd>
              <RevealNumber workerId={worker.id} document="iqama" last4={worker.iqamaLast4} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">{t("workers.fields.passportNumber")}</dt>
            <dd>{worker.passportLast4 ? <RevealNumber workerId={worker.id} document="passport" last4={worker.passportLast4} /> : <span className="text-slate-400">{t("common.notSet")}</span>}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <ExpiryBadge label={t("workers.docs.iqama")} date={worker.iqamaExpiry} today={today} />
          <ExpiryBadge label={t("workers.docs.passport")} date={worker.passportExpiry} today={today} />
        </div>
        <p className="text-xs text-slate-500">{t("workers.revealNote")}</p>
      </Card>

      <WorkerForm
        id={worker.id}
        values={{
          name: worker.name,
          nameAr: worker.nameAr,
          nationality: worker.nationality,
          jobTitle: worker.jobTitle,
          phone: worker.phone ? worker.phone.replace(/^\+966/, "0") : "",
          siteId: worker.siteId,
          basicSalary: halalasToInput(worker.basicSalary),
          housingAllowance: halalasToInput(worker.housingAllowance),
          transportAllowance: halalasToInput(worker.transportAllowance),
          otherAllowance: halalasToInput(worker.otherAllowance),
          iqamaExpiry: toDateInput(worker.iqamaExpiry),
          passportExpiry: toDateInput(worker.passportExpiry),
        }}
        masked={{ iqama: worker.iqamaLast4, passport: worker.passportLast4 }}
        siteGroups={groupSites(siteOptions, locale)}
        disabled={!canWrite || archived}
      />
    </div>
  );
}
