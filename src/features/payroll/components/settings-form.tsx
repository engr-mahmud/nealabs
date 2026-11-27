"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveSettingsAction } from "../actions";

export interface SettingsValues {
  overtimeBase: string;
  overtimePremium: string;
  hoursPerDay: string;
  monthDays: string;
  absenceBase: string;
}

export function PayrollSettingsForm({ values, disabled }: { values: SettingsValues; disabled: boolean }) {
  const t = useTranslations("payroll.settings");
  const [state, action] = useActionState(saveSettingsAction, null);
  const v = { ...values, ...(state?.values ?? {}) };
  const err = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("monthDays")} name="monthDays" defaultValue={v.monthDays} error={err.monthDays}>
            <option value="30">{t("monthDays30")}</option>
            <option value="0">{t("monthDaysCalendar")}</option>
          </SelectField>
          <Field label={t("hoursPerDay")} name="hoursPerDay" inputMode="numeric" defaultValue={v.hoursPerDay} error={err.hoursPerDay} ltr />
        </div>
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <p className="font-medium text-slate-900">{t("overtimeTitle")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label={t("overtimeBase")} name="overtimeBase" defaultValue={v.overtimeBase} error={err.overtimeBase}>
              <option value="GROSS">{t("baseGross")}</option>
              <option value="BASIC">{t("baseBasic")}</option>
            </SelectField>
            <Field label={t("overtimePremium")} name="overtimePremium" inputMode="decimal" defaultValue={v.overtimePremium} error={err.overtimePremium} hint={t("overtimePremiumHint")} ltr />
          </div>
          <p className="text-sm text-slate-600">{t("overtimeFormula")}</p>
        </div>
        <SelectField label={t("absenceBase")} name="absenceBase" defaultValue={v.absenceBase} error={err.absenceBase}>
          <option value="GROSS">{t("baseGross")}</option>
          <option value="BASIC">{t("baseBasic")}</option>
        </SelectField>
      </fieldset>
      {!disabled ? (
        <SubmitButton size="lg" pendingLabel={t("saving")}>
          {t("save")}
        </SubmitButton>
      ) : null}
    </form>
  );
}
