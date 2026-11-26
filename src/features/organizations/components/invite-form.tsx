"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { inviteMemberAction } from "../actions";

export function InviteForm() {
  const t = useTranslations("members");
  const [state, action] = useActionState(inviteMemberAction, null);
  return (
    <form action={action} className="space-y-4" noValidate key={state?.ok ? state.message : "form"}>
      {state?.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label={t("invite.email")} name="email" type="email" inputMode="email" ltr required defaultValue={state?.ok ? "" : state?.values?.email} error={state?.fieldErrors?.email} />
        <SelectField label={t("invite.role")} name="role" defaultValue={state?.ok ? "ACCOUNTANT" : (state?.values?.role ?? "ACCOUNTANT")} error={state?.fieldErrors?.role}>
          <option value="ACCOUNTANT">{t("roles.ACCOUNTANT")}</option>
          <option value="OWNER">{t("roles.OWNER")}</option>
        </SelectField>
      </div>
      <ul className="space-y-1 text-sm text-slate-600">
        <li>
          <strong className="font-medium text-slate-800">{t("roles.ACCOUNTANT")}:</strong> {t("roleHelp.ACCOUNTANT")}
        </li>
        <li>
          <strong className="font-medium text-slate-800">{t("roles.OWNER")}:</strong> {t("roleHelp.OWNER")}
        </li>
      </ul>
      <SubmitButton>{t("invite.submit")}</SubmitButton>
    </form>
  );
}
