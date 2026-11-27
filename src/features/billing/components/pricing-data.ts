import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { BILLING_CYCLES, PLANS, RECOMMENDED_PLAN, priceFor, type PlanCode } from "@/config/plans";
import { formatSar } from "@/lib/money";
import type { PricingLabels, PricingPlanView } from "./pricing-table";

/** Builds the pricing table props (formatted in the current language) from the plans config. */
export async function pricingProps(opts: { cta: string; suggested?: PlanCode | null; extraFeatures?: string[] }): Promise<{ plans: PricingPlanView[]; labels: PricingLabels }> {
  const [t, locale] = await Promise.all([getTranslations("billing"), getLocale()]);
  const plans = PLANS.map((p) => ({
    code: p.code,
    name: t(`planNames.${p.code}`),
    popular: p.code === RECOMMENDED_PLAN,
    suggested: opts.suggested === p.code,
    features: [t("workersUpTo", { count: p.maxWorkers }), t("invoicesUpTo", { count: p.maxInvoicesPerMonth }), ...(opts.extraFeatures ?? [])],
    prices: Object.fromEntries(
      BILLING_CYCLES.map((c) => {
        const price = priceFor(p.code, c);
        return [c, { amount: formatSar(price.totalHalalas, locale), saved: price.savedHalalas > 0 ? t("youSave", { amount: formatSar(price.savedHalalas, locale) }) : null }];
      }),
    ) as PricingPlanView["prices"],
  }));
  const labels: PricingLabels = {
    cycles: { MONTHLY: t("cycles.MONTHLY"), QUARTERLY: t("cycles.QUARTERLY"), YEARLY: t("cycles.YEARLY") },
    per: { MONTHLY: t("per.MONTHLY"), QUARTERLY: t("per.QUARTERLY"), YEARLY: t("per.YEARLY") },
    twoMonthsFree: t("twoMonthsFree"),
    popular: t("popular"),
    suggested: t("suggested"),
    exVat: t("exVat"),
    cta: opts.cta,
    cycleGroup: t("cycleGroup"),
  };
  return { plans, labels };
}
