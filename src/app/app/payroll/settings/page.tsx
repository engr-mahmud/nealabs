import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { param } from "@/features/master-data/list";
import { formatPercent } from "@/features/sales/totals";
import { PayrollTabs } from "@/features/payroll/components/payroll-tabs";
import { PayrollSettingsForm } from "@/features/payroll/components/settings-form";
import { getPayrollSettings } from "@/features/payroll/service";

export const metadata: Metadata = { title: "Payroll rules" };

export default async function PayrollSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await requireOrgPage();
  const [t, format, settings] = await Promise.all([getTranslations("payroll"), getFormatter(), getPayrollSettings(ctx)]);
  const canEdit = can(ctx.role, "org.update") && !ctx.access.readOnly;
  const done = param(await searchParams, "done");
  const r = settings.rules;

  return (
    <div className="max-w-3xl">
      <PayrollTabs current="settings" />
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      {done === "saved" ? <Alert tone="success" className="mb-4">{t("settings.saved")}</Alert> : null}
      <Alert tone="warning" className="mb-4">
        {t("settings.legal")}
      </Alert>
      {!settings.saved ? <Alert tone="info" className="mb-4">{t("settings.defaults")}</Alert> : null}
      {!can(ctx.role, "org.update") ? <Alert tone="info" className="mb-4">{t("settings.ownerOnly")}</Alert> : null}
      <Card>
        <PayrollSettingsForm
          disabled={!canEdit}
          values={{ overtimeBase: r.overtimeBase, overtimePremium: formatPercent(r.overtimePremium), hoursPerDay: String(r.hoursPerDay), monthDays: String(r.monthDays), absenceBase: r.absenceBase }}
        />
      </Card>
      <p className="mt-4 text-sm text-slate-600">{t("settings.appliesTo")}</p>
      {settings.updatedAt ? <p className="mt-1 text-sm text-slate-500">{t("settings.updatedAt", { date: format.dateTime(settings.updatedAt, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) })}</p> : null}
    </div>
  );
}
