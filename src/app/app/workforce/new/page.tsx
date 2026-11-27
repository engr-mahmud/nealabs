import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { listSiteOptions } from "@/features/sites/service";
import { WorkerForm } from "@/features/workforce/components/worker-form";
import { groupSites } from "@/features/workforce/site-groups";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "New worker" };

export default async function NewWorkerPage({ searchParams }: { searchParams: Promise<{ saved?: string; site?: string }> }) {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/workforce");
  const { saved, site } = await searchParams;
  const [t, locale, sites] = await Promise.all([getTranslations("workers"), getLocale(), listSiteOptions(ctx)]);
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("newTitle")} />
      {saved ? <Alert tone="success" className="mb-4">{t("saved")}</Alert> : null}
      <WorkerForm key={saved ? "saved" : "new"} values={{ siteId: sites.some((s) => s.id === site) ? site : "" }} siteGroups={groupSites(sites, locale)} />
    </div>
  );
}
