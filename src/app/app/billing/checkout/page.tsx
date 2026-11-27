import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { getPlan, isBillingCycle, isPlanCode } from "@/config/plans";
import { PayForm } from "@/features/billing/components/pay-form";
import { getBillingOverview, quoteCheckout } from "@/features/billing/service";
import { getOrganization } from "@/features/organizations/service";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { formatSar } from "@/lib/money";

export const metadata: Metadata = { title: "Review and pay" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string; cycle?: string }> }) {
  const { ctx } = await requireOrgPage();
  const { plan, cycle } = await searchParams;
  if (!isPlanCode(plan) || !isBillingCycle(cycle) || !can(ctx.role, "billing.manage")) redirect("/app/billing");

  const [t, tc, format, locale] = await Promise.all([getTranslations("billing"), getTranslations("billing.checkout"), getFormatter(), getLocale()]);
  const [quote, overview, org] = await Promise.all([quoteCheckout(ctx, plan, cycle), getBillingOverview(ctx), getOrganization(ctx)]);
  if (quote.renewalOpensAt) redirect("/app/billing");
  const { amounts, period } = quote;
  const monthly = getPlan(plan).monthlyPriceHalalas;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "long" });
  const sar = (h: number) => formatSar(h, locale);
  const planName = t(`planNames.${plan}`);
  const kind = overview.subscription?.status === "TRIALING" ? "trial" : "plan";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title={tc("title")} />
      {overview.testMode ? <Alert tone="warning">{t("testMode")}</Alert> : null}
      <Card>
        <dl className="space-y-3 text-sm">
          <Row label={tc("plan")} value={planName} />
          <Row label={tc("cycle")} value={t(`cycles.${cycle}`)} />
          <Row label={tc("period")} value={`${date(period.start)} – ${date(period.end)}`} />
        </dl>
        {quote.startsLater ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{tc("startsLater", { date: date(period.start), kind })}</p> : null}

        <dl className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-sm">
          {amounts.freeMonths > 0 ? (
            <>
              <Row label={tc("listPrice", { months: amounts.months, price: sar(monthly) })} value={sar(monthly * amounts.months)} />
              <Row label={<span className="font-medium text-emerald-700">{tc("freeMonths")}</span>} value={<span className="font-medium text-emerald-700">-{sar(amounts.savedHalalas)}</span>} />
            </>
          ) : null}
          <Row label={tc("subtotal")} value={sar(amounts.subtotal)} />
          <Row label={tc("vat")} value={sar(amounts.vatAmount)} />
          <div className="flex justify-between gap-4 border-t border-slate-900 pt-3 text-base font-bold text-slate-900">
            <dt>{tc("total")}</dt>
            <dd>{sar(amounts.total)}</dd>
          </div>
        </dl>

        <div className="mt-6">
          <PayForm plan={plan} cycle={cycle} label={tc("pay", { amount: sar(amounts.total) })} pendingLabel={tc("pay", { amount: sar(amounts.total) })} />
        </div>
        <p className="mt-3 text-xs text-slate-600">{tc("methods")}</p>
        <p className="mt-2 text-xs text-slate-600">
          {tc("invoiceNote", { company: locale === "ar" && org.nameAr ? org.nameAr : org.nameEn })} {org.vatNumber ? null : tc("vatHint")}
        </p>
        <p className="mt-2 text-xs text-slate-600">
          {tc.rich("terms", {
            terms: (chunks) => (
              <Link href="/terms" target="_blank" className="underline">
                {chunks}
              </Link>
            ),
            refund: (chunks) => (
              <Link href="/refund" target="_blank" className="underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </Card>
      <p>
        <Link href="/app/billing" className="text-sm font-medium text-brand hover:underline">
          {tc("back")}
        </Link>
      </p>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-end font-medium text-slate-900">{value}</dd>
    </div>
  );
}
