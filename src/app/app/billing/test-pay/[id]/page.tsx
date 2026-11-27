import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { testPayAction } from "@/features/billing/actions";
import { activeGatewayName } from "@/features/billing/gateway";
import { getCheckout } from "@/features/billing/service";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { NotFoundError } from "@/lib/errors";
import { formatSar } from "@/lib/money";

export const metadata: Metadata = { title: "Test payment" };

/** Stands in for the gateway's hosted page while PAYMENT_GATEWAY=test. */
export default async function TestPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireOrgPage();
  const { id } = await params;
  if (activeGatewayName() !== "test" || !can(ctx.role, "billing.manage")) notFound();
  const checkout = await getCheckout(ctx, id.slice(0, 40)).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  if (checkout.gateway !== "test" || checkout.status !== "PENDING") notFound();
  const [t, locale] = await Promise.all([getTranslations("billing.testPay"), getLocale()]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Alert tone="warning">{t("body")}</Alert>
      <Card>
        <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
        <p className="mt-4 text-sm text-slate-600">{t("amount")}</p>
        <p className="text-3xl font-bold text-slate-900">{formatSar(checkout.total, locale)}</p>
        <form action={testPayAction} className="mt-6 flex flex-col gap-2">
          <input type="hidden" name="checkoutId" value={checkout.id} />
          <SubmitButton name="outcome" value="paid" size="lg">
            {t("pay")}
          </SubmitButton>
          <SubmitButton name="outcome" value="failed" variant="secondary">
            {t("decline")}
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
