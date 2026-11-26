import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { brand } from "@/config/brand";
import { PLANS } from "@/config/plans";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { formatSar } from "@/lib/money";

export const metadata: Metadata = { title: "Plan & billing" };

const STATUS_TONE = { trialing: "brand", active: "success", past_due: "danger", expired: "warning" } as const;

export default async function BillingPage() {
  const { ctx } = await requireOrgPage();
  const [t, format, locale] = await Promise.all([getTranslations("billing"), getFormatter(), getLocale()]);
  const { access } = ctx;
  const date = access.endsAt ? format.dateTime(access.endsAt, { dateStyle: "long" }) : null;
  const whatsapp = `https://wa.me/${brand.whatsappNumber}`;

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STATUS_TONE[access.state]}>{t(`status.${access.state}`)}</Badge>
          {date ? (
            <span className="text-slate-700">
              {access.state === "trialing" ? t("trialEnds", { date }) : access.state === "expired" ? t("endedOn", { date }) : t("renewsOn", { date })}
            </span>
          ) : null}
        </div>
      </Card>

      <section aria-labelledby="plans-title" className="space-y-3">
        <h2 id="plans-title" className="text-lg font-semibold text-slate-900">
          {t("plans")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card key={plan.code} className="flex flex-col">
              <CardTitle>{t(`planNames.${plan.code}`)}</CardTitle>
              <p className="mt-2">
                <span className="text-3xl font-bold text-slate-900">{formatSar(plan.monthlyPriceHalalas, locale)}</span>{" "}
                <span className="text-slate-500">{t("perMonth")}</span>
              </p>
              <ul className="mt-4 space-y-1 text-sm text-slate-600">
                <li>{t("workersUpTo", { count: plan.maxWorkers })}</li>
                <li>{t("invoicesUpTo", { count: plan.maxInvoicesPerMonth })}</li>
              </ul>
            </Card>
          ))}
        </div>
        <p className="text-sm text-slate-500">{t("exVat")}</p>
      </section>

      {can(ctx.role, "billing.manage") ? (
        <Alert>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("comingSoon")}</span>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md", "shrink-0")}>
              {t("whatsapp")}
            </a>
          </div>
        </Alert>
      ) : (
        <Alert>{t("ownerOnly")}</Alert>
      )}
    </div>
  );
}
