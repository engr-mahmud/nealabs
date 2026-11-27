import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { ImportWizard } from "@/features/import/components/import-wizard";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Import sites" };

export default async function ImportSitesPage() {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/sites");
  const t = await getTranslations("import");
  return (
    <div className="max-w-5xl">
      <PageHeader title={t("title.sites")} subtitle={t("subtitle")} />
      <Alert className="mb-4">{t("sitesNeedClients")}</Alert>
      <ImportWizard type="sites" listPath="/app/sites" />
    </div>
  );
}
