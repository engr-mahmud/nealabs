import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { can } from "@/features/organizations/permissions";
import { requireOrgPage } from "@/features/organizations/current";
import { getOrganization } from "@/features/organizations/service";
import { orgFormValues } from "@/features/organizations/form-values";
import { OrgSettingsForm } from "@/features/organizations/components/org-settings-form";
import { LogoForm } from "@/features/organizations/components/logo-form";
import { OrgAvatar } from "@/features/organizations/components/org-avatar";

export const metadata: Metadata = { title: "Company" };

export default async function OrganizationSettingsPage() {
  const { ctx } = await requireOrgPage();
  const t = await getTranslations();
  const org = await getOrganization(ctx);
  const isOwner = can(ctx.role, "org.update");
  const disabled = !isOwner || ctx.access.readOnly;

  return (
    <div className="max-w-3xl">
      <PageHeader title={t("org.settings.title")} subtitle={t("org.settings.subtitle")} />
      {!isOwner ? <Alert className="mb-4">{t("org.settings.ownerOnly")}</Alert> : null}
      <Card id="logo" className="mb-4">
        <CardTitle className="mb-4">{t("org.settings.logo")}</CardTitle>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <OrgAvatar orgId={org.id} name={org.nameEn} logoVersion={org.logo?.updatedAt.toISOString() ?? null} size={72} />
          <LogoForm hasLogo={!!org.logo} disabled={disabled} />
          {!org.logo && disabled ? <p className="text-sm text-slate-500">{t("org.logo.none")}</p> : null}
        </div>
      </Card>
      <OrgSettingsForm values={orgFormValues(org)} disabled={disabled} />
      <Card className="mt-4">
        <CardTitle>{t("export.button")}</CardTitle>
        <p className="mt-1 mb-4 text-sm text-slate-600">{t("export.help")}</p>
        <a href="/api/export" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50">
          {t("export.button")}
        </a>
      </Card>
    </div>
  );
}
