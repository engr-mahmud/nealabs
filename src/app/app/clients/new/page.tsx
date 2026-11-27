import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { ClientForm } from "@/features/clients/components/client-form";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/clients");
  const t = await getTranslations("clients");
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("newTitle")} />
      <ClientForm values={{}} />
    </div>
  );
}
