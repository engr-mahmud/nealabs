"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { addPaymentAction, salesDocCommandAction } from "../actions";
import type { SalesTypeSlug } from "../status";

export interface DocCommand {
  command: "send" | "issue" | "convert-PROFORMA" | "convert-INVOICE";
  label: string;
  primary?: boolean;
}

/** The main buttons of a document. Errors (for example a missing VAT number) show above them. */
export function DocActions({ id, type, commands, canDelete }: { id: string; type: SalesTypeSlug; commands: DocCommand[]; canDelete: boolean }) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const [state, action] = useActionState(salesDocCommandAction, null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (commands.length === 0 && !canDelete) return null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="type" value={type} />
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {commands.map((c) => (
          <SubmitButton key={c.command} name="command" value={c.command} variant={c.primary ? "primary" : "secondary"} size={c.primary ? "lg" : "md"} className="w-full sm:w-auto">
            {c.label}
          </SubmitButton>
        ))}
        {canDelete ? (
          confirmDelete ? (
            <span className="flex flex-wrap items-center gap-2" role="group">
              <span className="text-sm text-slate-700">{t("actions.deleteConfirm")}</span>
              <Button type="submit" name="command" value="delete" variant="danger" size="sm">
                {t("actions.delete")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                {tc("cancel")}
              </Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
              {t("actions.deleteDraft")}
            </Button>
          )
        ) : null}
      </div>
    </form>
  );
}

/** Record a payment: amount defaults to the balance, date to today. */
export function PaymentForm({ id, balance, today }: { id: string; balance: string; today: string }) {
  const t = useTranslations("sales");
  const [state, action] = useActionState(addPaymentAction, null);
  const v = state?.values;
  const e = state?.fieldErrors;
  const input =
    "block w-full min-h-11 rounded-lg border bg-white px-3 text-base text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="id" value={id} />
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-800">{t("payments.amount")}</span>
          <input name="amount" inputMode="decimal" dir="ltr" defaultValue={v?.amount ?? balance} aria-invalid={e?.amount ? true : undefined} className={`${input} ${e?.amount ? "border-red-400" : "border-slate-300"}`} />
          {e?.amount ? <span className="block text-sm text-red-700">{e.amount}</span> : null}
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-800">{t("payments.paidOn")}</span>
          <input name="paidOn" type="date" dir="ltr" defaultValue={v?.paidOn ?? today} aria-invalid={e?.paidOn ? true : undefined} className={`${input} ${e?.paidOn ? "border-red-400" : "border-slate-300"}`} />
          {e?.paidOn ? <span className="block text-sm text-red-700">{e.paidOn}</span> : null}
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-800">{t("payments.method")}</span>
          <select name="method" defaultValue={v?.method ?? "BANK_TRANSFER"} className={`${input} border-slate-300`}>
            {(["BANK_TRANSFER", "CASH", "CHEQUE", "CARD", "OTHER"] as const).map((m) => (
              <option key={m} value={m}>
                {t(`methods.${m}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 sm:col-span-3">
          <span className="block text-sm font-medium text-slate-800">
            {t("payments.reference")} <span className="font-normal text-slate-500">({t("payments.referenceHint")})</span>
          </span>
          <input name="reference" defaultValue={v?.reference ?? ""} className={`${input} border-slate-300`} autoComplete="off" />
        </label>
      </div>
      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={t("payments.saving")}>
        {t("payments.add")}
      </SubmitButton>
    </form>
  );
}
