"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateOrganizationAction } from "../actions";
import { BankFields, CompanyNameFields, LegalFields, type OrgValues } from "./org-fields";

export function OrgSettingsForm({ values, disabled }: { values: OrgValues; disabled: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(updateOrganizationAction, null);
  const v = state?.values ?? values;
  const errors = state?.fieldErrors;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <Card>
        <CardTitle className="mb-4">{t("org.settings.company")}</CardTitle>
        <CompanyNameFields values={v} errors={errors} disabled={disabled} />
      </Card>
      <Card id="legal">
        <CardTitle className="mb-4">{t("org.settings.legal")}</CardTitle>
        <LegalFields values={v} errors={errors} disabled={disabled} />
      </Card>
      <Card id="bank">
        <CardTitle className="mb-4">{t("org.settings.bank")}</CardTitle>
        <BankFields values={v} errors={errors} disabled={disabled} />
      </Card>
      {disabled ? null : (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={t("common.saving")}>
            {t("common.save")}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
