"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { approveAction } from "../actions";

/** Approve with a pay date. Two steps, because approving records the salaries as expenses. */
export function ApproveForm({ sheetId, defaultPayDate, totalLabel }: { sheetId: string; defaultPayDate: string; totalLabel: string }) {
  const t = useTranslations("payroll");
  const tc = useTranslations("common");
  const [state, action] = useActionState(approveAction, null);
  const [open, setOpen] = useState(false);
  if (!open && !state) {
    return (
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        {t("approve.button")}
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4" noValidate>
      <input type="hidden" name="sheetId" value={sheetId} />
      <p className="text-sm text-slate-800">{t("approve.explain", { total: totalLabel })}</p>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Field label={t("approve.payDate")} name="payDate" type="date" defaultValue={state?.values?.payDate ?? defaultPayDate} error={state?.fieldErrors?.payDate} className="max-w-xs" required />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="lg" pendingLabel={t("approve.pending")}>
          {t("approve.confirm")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
          {tc("cancel")}
        </Button>
      </div>
    </form>
  );
}
