"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { recordRefundAction } from "../actions";
import { paymentMethods } from "../schemas";

/** Record money paid back to a client; amount defaults to what is owed. */
export function RefundForm({ id, due, today }: { id: string; due: string; today: string }) {
  const t = useTranslations("finance.refund");
  const ts = useTranslations("sales");
  const [state, action] = useActionState(recordRefundAction, null);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="id" value={id} />
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="refund-amount" name="amount" label={t("amount")} inputMode="decimal" ltr defaultValue={v?.amount ?? due} error={e?.amount} />
        <Field id="refund-date" name="date" label={t("date")} type="date" ltr defaultValue={v?.date ?? today} error={e?.date} />
        <SelectField name="method" label={t("method")} defaultValue={v?.method ?? "BANK_TRANSFER"}>
          {paymentMethods.map((m) => (
            <option key={m} value={m}>
              {ts(`methods.${m}`)}
            </option>
          ))}
        </SelectField>
        <Field id="refund-reference" name="reference" label={t("reference")} defaultValue={v?.reference ?? ""} className="sm:col-span-3" autoComplete="off" />
      </div>
      <SubmitButton size="lg" variant="secondary" className="w-full sm:w-auto" pendingLabel={ts("payments.saving")}>
        {t("add")}
      </SubmitButton>
    </form>
  );
}
