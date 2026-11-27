"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextareaField } from "@/components/ui/textarea-field";
import { saveClientAction } from "../actions";

export type ClientValues = Partial<Record<string, string | null>>;

export function ClientForm({ id, values, disabled }: { id?: string; values: ClientValues; disabled?: boolean }) {
  const t = useTranslations();
  const [state, action] = useActionState(saveClientAction, null);
  const v = state?.values ?? values;
  const e = state?.fieldErrors;
  const f = (name: string) => ({ name, defaultValue: v[name] ?? "", error: e?.[name], disabled, label: t(`clients.fields.${name}`) });
  return (
    <form action={action} className="space-y-4" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Card>
        <CardTitle className="mb-4">{t("clients.sections.company")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...f("nameEn")} required dir="ltr" autoComplete="off" />
          <Field {...f("nameAr")} dir="rtl" lang="ar" optionalLabel={t("common.optional")} />
          <Field {...f("vatNumber")} inputMode="numeric" ltr hint={t("clients.vatHint")} optionalLabel={t("common.optional")} />
          <Field {...f("crNumber")} inputMode="numeric" ltr optionalLabel={t("common.optional")} />
        </div>
      </Card>
      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm" open={!!(v.contactName || v.phone || v.email || v.addressLine || v.city || v.notes || e)}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-lg font-semibold text-slate-900 sm:px-6 [&::-webkit-details-marker]:hidden">
          {t("clients.sections.contact")} · {t("clients.sections.address")}
          <span aria-hidden className="text-slate-400 transition group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="grid gap-4 px-5 pb-6 sm:grid-cols-2 sm:px-6">
          <Field {...f("contactName")} autoComplete="off" />
          <Field {...f("phone")} type="tel" inputMode="tel" ltr />
          <Field {...f("email")} type="email" inputMode="email" ltr className="sm:col-span-2" />
          <Field {...f("addressLine")} className="sm:col-span-2" />
          <Field {...f("city")} />
          <Field {...f("postalCode")} inputMode="numeric" ltr />
          <TextareaField {...f("notes")} className="sm:col-span-2" />
        </div>
      </details>
      {disabled ? null : (
        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={t("common.saving")}>
            {id ? t("common.save") : t("clients.add")}
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
