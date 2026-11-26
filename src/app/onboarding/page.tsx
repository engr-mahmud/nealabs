import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { requireSession } from "@/features/auth/session";
import { skipSetupAction } from "@/features/organizations/actions";
import { loadOrgContext } from "@/features/organizations/context";
import { CompanyNameStep, FinalStep, LegalStep } from "@/features/organizations/components/onboarding-forms";
import { orgFormValues, type OrgValues } from "@/features/organizations/form-values";
import { listUserOrganizations } from "@/features/organizations/service";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Setup" };

const TOTAL = 3;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const session = await requireSession();
  const t = await getTranslations();
  const orgs = await listUserOrganizations(session.userId);

  let step = 1;
  let values: OrgValues = {};
  if (orgs.length > 0) {
    const activeId = orgs.some((o) => o.id === session.activeOrganizationId) ? session.activeOrganizationId! : orgs[0]!.id;
    const ctx = await loadOrgContext(session.userId, activeId);
    const org = await prisma.organization.findUnique({ where: { id: activeId } });
    // Only the owner sets up a company; accountants and finished setups go to the app.
    if (!ctx || !org || ctx.role !== "OWNER" || org.setupCompletedAt || ctx.access.readOnly) redirect("/app");
    step = (await searchParams).step === "3" ? 3 : 2;
    values = orgFormValues(org);
  }

  // Rendered inside the step form, so it overrides the form action instead of nesting a form.
  const skip = (
    <button
      type="submit"
      formAction={skipSetupAction}
      formNoValidate
      className="min-h-11 w-full rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:w-auto"
    >
      {t("common.skip")}
    </button>
  );
  const skipLink =
    step === 2 ? (
      <a href="/onboarding?step=3" className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
        {t("common.skip")}
      </a>
    ) : (
      skip
    );

  return (
    <div className="flex min-h-dvh flex-col px-4">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between py-4">
        <BrandMark href="/onboarding" />
        <LanguageSwitch />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 pt-4 pb-12 sm:pt-8">
        <ol className="mb-6 flex gap-2" aria-label={t("onboarding.stepOf", { current: step, total: TOTAL })}>
          {Array.from({ length: TOTAL }, (_, i) => (
            <li key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-brand" : "bg-slate-200"}`} />
          ))}
        </ol>
        <Card className="space-y-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-brand">{t("onboarding.stepOf", { current: step, total: TOTAL })}</p>
            <h1 className="text-2xl font-semibold text-slate-900">{t(`onboarding.step${step}.title`)}</h1>
            <p className="text-slate-600">{t(`onboarding.step${step}.subtitle`)}</p>
          </div>
          {step === 1 ? <CompanyNameStep /> : null}
          {step === 2 ? <LegalStep values={values} skip={skipLink} /> : null}
          {step === 3 ? <FinalStep values={values} skip={skip} /> : null}
        </Card>
      </main>
    </div>
  );
}
