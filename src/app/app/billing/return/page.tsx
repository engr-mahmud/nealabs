import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { refreshCheckout } from "@/features/billing/service";
import { requireOrgPage } from "@/features/organizations/current";
import { NotFoundError } from "@/lib/errors";

export const metadata: Metadata = { title: "Payment" };

/** Where the payment page sends the customer back. The result is confirmed with the gateway, never taken from the URL. */
export default async function BillingReturnPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { ctx } = await requireOrgPage();
  const { checkout: id } = await searchParams;
  if (!id) redirect("/app/billing");
  const [t, tb, format, locale] = await Promise.all([getTranslations("billing.return"), getTranslations("billing"), getFormatter(), getLocale()]);
  let checkout;
  try {
    checkout = await refreshCheckout(ctx, id.slice(0, 40));
  } catch (e) {
    if (e instanceof NotFoundError) redirect("/app/billing");
    throw e;
  }
  const retry = `/app/billing/checkout?plan=${checkout.planCode}&cycle=${checkout.billingCycle}`;

  let title: string;
  let body: string | null = null;
  let tone: "success" | "pending" | "failed";
  if (checkout.status === "PAID") {
    tone = "success";
    title = t("paidTitle");
    body = t("paidBody", { plan: tb(`planNames.${checkout.planCode}`), date: format.dateTime(checkout.periodEnd!, { dateStyle: "long" }) });
  } else if (checkout.status === "PENDING") {
    tone = "pending";
    title = t("pendingTitle");
    body = t("pendingBody");
  } else {
    tone = "failed";
    title = checkout.status === "EXPIRED" ? t("expiredTitle") : t("failedTitle");
    body = checkout.status === "FAILED" ? t("failedBody") : null;
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card className="text-center">
        <div
          aria-hidden
          className={
            tone === "success"
              ? "mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700"
              : tone === "pending"
                ? "mx-auto flex size-14 items-center justify-center rounded-full bg-sky-100 text-2xl text-sky-700"
                : "mx-auto flex size-14 items-center justify-center rounded-full bg-red-100 text-2xl text-red-700"
          }
        >
          {tone === "success" ? "✓" : tone === "pending" ? "…" : "!"}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        {body ? <p className="mt-2 text-slate-700">{body}</p> : null}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          {tone === "success" && checkout.invoice ? (
            <a href={`/api/billing/invoices/${checkout.invoice.id}?format=pdf&lang=${locale}`} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover">
              {t("invoice")}
            </a>
          ) : null}
          {tone === "pending" ? <ButtonLink href={`/app/billing/return?checkout=${checkout.id}`}>{t("refresh")}</ButtonLink> : null}
          {tone === "failed" ? <ButtonLink href={retry}>{t("tryAgain")}</ButtonLink> : null}
          <ButtonLink href="/app/billing" variant="secondary">
            {t("toBilling")}
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
