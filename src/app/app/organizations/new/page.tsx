import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { CompanyNameStep } from "@/features/organizations/components/onboarding-forms";

export const metadata: Metadata = { title: "Add company" };

export default async function NewOrganizationPage() {
  const t = await getTranslations("org.new");
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card>
        <CompanyNameStep submitLabel={t("submit")} />
      </Card>
    </div>
  );
}
