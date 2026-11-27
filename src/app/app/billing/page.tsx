import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { brand } from "@/config/brand";
import { PLANS, getPlan, isPlanCode, type PlanCode } from "@/config/plans";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { pricingProps } from "@/features/billing/components/pricing-data";
import { getBillingOverview, suggestedPlan } from "@/features/billing/service";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { formatSar } from "@/lib/money";

export const metadata: Metadata = { title: "Plan & billing" };

const STATUS_TONE = { trialing: "brand", active: "success", past_due: "danger", expired: "warning" } as const;

export default async function BillingPage() {
  const { ctx } = await requireOrgPage();
  const [t, format, locale] = await Promise.all([getTranslations("billing"), getFormatter(), getLocale()]);
  const overview = await getBillingOverview(ctx);
  const { access } = ctx;
  const fmtDate = (d: Date) => format.dateTime(d, { dateStyle: "long" });
  const plan = overview.plan?.planCode && isPlanCode(overview.plan.planCode) ? getPlan(overview.plan.planCode) : null;
  const cycle = overview.plan?.billingCycle ?? null;
  const isOwner = can(ctx.role, "billing.manage");
  const suggested: PlanCode = suggestedPlan(overview.usage, PLANS);
  const limits = plan ?? getPlan(suggested);
  const over = plan ? overview.usage.workers > plan.maxWorkers || overview.usage.invoicesThisMonth > plan.maxInvoicesPerMonth : false;
  const pricing = isOwner && !overview.renewalOpensAt ? await pricingProps({ cta: t("select", { plan: "{plan}" }), suggested }) : null;
  const scheduled = overview.plan?.scheduled;

  let dateLine: string | null = null;
  if (access.endsAt) {
    const date = fmtDate(access.endsAt);
    dateLine =
      access.state === "trialing" ? t("trialEnds", { date }) : access.state === "expired" ? t("endedOn", { date }) : access.state === "past_due" ? t("graceUntil", { date }) : t("renewsOn", { date });
  }

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {overview.testMode ? <Alert tone="warning">{t("testMode")}</Alert> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={STATUS_TONE[access.state]}>{t(`status.${access.state}`)}</Badge>
            <span className="font-semibold text-slate-900">{plan && cycle ? t("currentPlan", { plan: t(`planNames.${plan.code}`), cycle: t(`cycles.${cycle}`) }) : t("noPlan")}</span>
          </div>
          {dateLine ? <p className="mt-3 text-slate-700">{dateLine}</p> : null}
          {scheduled && isPlanCode(scheduled.planCode) && scheduled.billingCycle ? (
            <p className="mt-1 text-sm text-slate-600">{t("scheduled", { date: fmtDate(scheduled.from), plan: t(`planNames.${scheduled.planCode}`), cycle: t(`cycles.${scheduled.billingCycle}`) })}</p>
          ) : null}
          <p className="mt-4 text-sm text-slate-600">{t("noAutoCharge")}</p>
        </Card>

        <Card>
          <CardTitle className="text-base">{t("usage")}</CardTitle>
          <dl className="mt-3 space-y-3 text-sm">
            <UsageRow label={t("workersUsage")} used={overview.usage.workers} max={limits.maxWorkers} />
            <UsageRow label={t("invoicesUsage")} used={overview.usage.invoicesThisMonth} max={limits.maxInvoicesPerMonth} />
          </dl>
          {over ? <Alert tone="warning" className="mt-4">{t("overLimit")}</Alert> : null}
        </Card>
      </div>

      {!isOwner ? <Alert>{t("ownerOnly")}</Alert> : null}
      {isOwner && overview.renewalOpensAt ? <Alert>{t("renewOpens", { date: fmtDate(overview.renewalOpensAt) })}</Alert> : null}
      {pricing ? (
        <section aria-labelledby="plans-title" className="space-y-4">
          <h2 id="plans-title" className="text-lg font-semibold text-slate-900">
            {t("plans")}
          </h2>
          <PricingTable plans={pricing.plans} labels={pricing.labels} hrefTemplate="/app/billing/checkout?plan={plan}&cycle={cycle}" initialCycle={cycle ?? "YEARLY"} />
        </section>
      ) : null}

      <Card className="p-0 sm:p-0">
        <div className="px-5 pt-5 sm:px-6">
          <CardTitle>{t("invoices")}</CardTitle>
        </div>
        {overview.invoices.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-600 sm:px-6">{t("noInvoices")}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-start text-slate-600">
                <tr>
                  <th className="px-5 py-2 text-start font-medium sm:px-6">{t("invoiceNo")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("date")}</th>
                  <th className="hidden px-3 py-2 text-start font-medium sm:table-cell">{t("period")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("amount")}</th>
                  <th className="px-5 py-2 sm:px-6">
                    <span className="sr-only">{t("download")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-3 font-medium sm:px-6">
                      <span className="ltr-nums">{inv.number}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{format.dateTime(inv.issuedAt, { dateStyle: "medium" })}</td>
                    <td className="hidden px-3 py-3 text-slate-700 sm:table-cell">
                      {format.dateTime(inv.periodStart, { dateStyle: "medium" })} – {format.dateTime(inv.periodEnd, { dateStyle: "medium" })}
                    </td>
                    <td className="px-3 py-3 text-end font-medium">{formatSar(inv.total, locale)}</td>
                    <td className="px-5 py-3 sm:px-6">
                      <div className="flex justify-end gap-3 whitespace-nowrap">
                        <a className="font-medium text-brand hover:underline" href={`/api/billing/invoices/${inv.id}?lang=${locale}`} target="_blank" rel="noopener">
                          {t("view")}
                        </a>
                        <a className="font-medium text-brand hover:underline" href={`/api/billing/invoices/${inv.id}?format=pdf&lang=${locale}`}>
                          {t("download")}
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-sm">
        <a href={`https://wa.me/${brand.whatsappNumber}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">
          {t("whatsapp")}
        </a>
      </p>
    </div>
  );
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex justify-between gap-2">
        <dt className="text-slate-700">{label}</dt>
        <dd className="font-medium text-slate-900">
          <span className="ltr-nums">
            {used} / {max}
          </span>
        </dd>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-100" aria-hidden>
        <div className={used > max ? "h-2 rounded-full bg-amber-500" : "h-2 rounded-full bg-brand"} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
