"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { saveCategoryAction } from "../actions";
import type { FinanceKindValue } from "../schemas";

/** Add a category (id empty) or rename one. The type is fixed once created. */
export function CategoryForm({ id, kind, nameEn, nameAr, compact }: { id?: string; kind?: FinanceKindValue; nameEn?: string; nameAr?: string | null; compact?: boolean }) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const [state, action] = useActionState(saveCategoryAction, null);
  const v = state?.values;
  const e = state?.fieldErrors;
  const prefix = id ?? "new";
  return (
    <form action={action} className="space-y-3" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {id ? <input type="hidden" name="kind" value={kind} /> : null}
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-3"}>
        {id ? null : (
          <SelectField name="kind" label={t("categories.kind")} defaultValue={v?.kind ?? kind ?? "EXPENSE"}>
            <option value="EXPENSE">{t("kinds.EXPENSE")}</option>
            <option value="INCOME">{t("kinds.INCOME")}</option>
          </SelectField>
        )}
        <Field id={`${prefix}-nameEn`} name="nameEn" label={t("categories.nameEn")} dir="ltr" defaultValue={v?.nameEn ?? nameEn ?? ""} error={e?.nameEn} autoComplete="off" />
        <Field id={`${prefix}-nameAr`} name="nameAr" label={t("categories.nameAr")} dir="rtl" lang="ar" defaultValue={v?.nameAr ?? nameAr ?? ""} error={e?.nameAr} optionalLabel={tc("optional")} autoComplete="off" />
      </div>
      <SubmitButton variant={id ? "secondary" : "primary"} pendingLabel={tc("saving")}>
        {id ? tc("save") : t("categories.add")}
      </SubmitButton>
    </form>
  );
}
