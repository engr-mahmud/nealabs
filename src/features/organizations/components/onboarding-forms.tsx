"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { FileInput } from "@/components/ui/file-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { createOrganizationAction, saveFinalStepAction, saveLegalStepAction } from "../actions";
import { LOGO_TYPES } from "../schemas";
import { BankFields, CompanyNameFields, LegalFields, type OrgValues } from "./org-fields";

export function CompanyNameStep({ submitLabel }: { submitLabel?: string }) {
  const t = useTranslations("common");
  const [state, action] = useActionState(createOrganizationAction, null);
  return (
    <form action={action} className="space-y-6" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <CompanyNameFields values={state?.values ?? {}} errors={state?.fieldErrors} />
      <SubmitButton size="lg" className="w-full sm:w-auto">
        {submitLabel ?? t("continue")}
      </SubmitButton>
    </form>
  );
}

export function LegalStep({ values, skip }: { values: OrgValues; skip: React.ReactNode }) {
  const t = useTranslations("common");
  const [state, action] = useActionState(saveLegalStepAction, null);
  return (
    <form action={action} className="space-y-6" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <LegalFields values={state?.values ?? values} errors={state?.fieldErrors} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {skip}
        <SubmitButton size="lg" className="sm:ms-auto">
          {t("continue")}
        </SubmitButton>
      </div>
    </form>
  );
}

export function FinalStep({ values, skip }: { values: OrgValues; skip: React.ReactNode }) {
  const t = useTranslations();
  const [state, action] = useActionState(saveFinalStepAction, null);
  return (
    <form action={action} className="space-y-6" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-800">
          {t("org.settings.logo")} <span className="font-normal text-slate-500">({t("common.optional")})</span>
        </p>
        <FileInput name="logo" accept={LOGO_TYPES.join(",")} chooseLabel={t("org.logo.choose")} noFileLabel={t("org.logo.noFile")} describedBy="logo-hint" />
        <p id="logo-hint" className="text-sm text-slate-500">{t("org.logo.hint")}</p>
      </div>
      <BankFields values={state?.values ?? values} errors={state?.fieldErrors} />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {skip}
        <SubmitButton size="lg" className="sm:ms-auto">
          {t("onboarding.finish")}
        </SubmitButton>
      </div>
    </form>
  );
}
