"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateLineAction } from "../actions";

export interface LineValues {
  absentDays: string;
  overtimeHours: string;
  additions: string;
  advances: string;
  deductions: string;
  notes: string;
}

/** The inputs of one worker on a draft sheet. The server recalculates and checks the net pay. */
export function LineEditor({ id, values }: { id: string; values: LineValues }) {
  const t = useTranslations("payroll");
  const tc = useTranslations("common");
  const [state, action] = useActionState(updateLineAction, null);
  const v = state && !state.ok ? { ...values, ...state.values } : values;
  const err = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Field label={t("fields.absentDays")} name="absentDays" id={`ad-${id}`} inputMode="decimal" defaultValue={v.absentDays} error={err.absentDays} ltr />
        <Field label={t("fields.overtimeHours")} name="overtimeHours" id={`ot-${id}`} inputMode="decimal" defaultValue={v.overtimeHours} error={err.overtimeHours} ltr />
        <Field label={t("fields.additions")} name="additions" id={`add-${id}`} inputMode="decimal" defaultValue={v.additions} error={err.additions} ltr />
        <Field label={t("fields.advances")} name="advances" id={`adv-${id}`} inputMode="decimal" defaultValue={v.advances} error={err.advances} ltr />
        <Field label={t("fields.deductions")} name="deductions" id={`ded-${id}`} inputMode="decimal" defaultValue={v.deductions} error={err.deductions} ltr className="col-span-2 sm:col-span-1" />
      </div>
      <Field label={t("fields.notes")} name="notes" id={`n-${id}`} defaultValue={v.notes} error={err.notes} optionalLabel={tc("optional")} maxLength={300} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingLabel={t("saving")}>{t("saveLine")}</SubmitButton>
        {state?.message ? (
          <p role="status" className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
