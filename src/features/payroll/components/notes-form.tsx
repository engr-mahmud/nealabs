"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveNotesAction } from "../actions";

export function NotesForm({ sheetId, notes }: { sheetId: string; notes: string }) {
  const t = useTranslations("payroll");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveNotesAction, null);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
      <input type="hidden" name="sheetId" value={sheetId} />
      <Field label={t("fields.sheetNotes")} name="notes" defaultValue={state?.values?.notes ?? notes} error={state?.fieldErrors?.notes ?? (state && !state.ok ? state.message : undefined)} optionalLabel={tc("optional")} maxLength={500} className="flex-1" />
      <SubmitButton variant="secondary" pendingLabel={t("saving")}>
        {tc("save")}
      </SubmitButton>
      {state?.ok && state.message ? (
        <p role="status" className="text-sm text-emerald-700 sm:self-center">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
