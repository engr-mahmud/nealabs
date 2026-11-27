import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { ImportWizard } from "@/features/import/components/import-wizard";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "Import clients" };

export default async function ImportClientsPage() {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/clients");
  const t = await getTranslations("import");
  return (
    <div className="max-w-5xl">
      <PageHeader title={t("title.clients")} subtitle={t("subtitle")} />
      <ImportWizard type="clients" listPath="/app/clients" />
    </div>
  );
}
