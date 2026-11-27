"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSar } from "@/lib/money";
import { parseSarToHalalas } from "@/lib/parse";
import { financeConfig } from "@/config/finance";
import { saveEntryAction } from "../actions";
import { paymentMethods, type FinanceKindValue } from "../schemas";
import { vatFromGross } from "../vat";

export interface EntryFormOptions {
  categories: { id: string; kind: FinanceKindValue; nameEn: string; nameAr: string | null }[];
  sites: { id: string; name: string; client: { nameEn: string; nameAr: string | null } }[];
}

export type EntryValues = Partial<Record<string, string>>;

/**
 * One screen to record income or an expense: amount, category and date first; site,
 * method and notes are optional. The VAT split is previewed live and recomputed on the server.
 */
export function EntryForm({ id, kind, values, options }: { id?: string; kind: FinanceKindValue; values: EntryValues; options: EntryFormOptions }) {
  const t = useTranslations("finance");
  const ts = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action] = useActionState(saveEntryAction, null);
  const v = state?.values ?? values;
  const e = state?.fieldErrors;
  const [amount, setAmount] = useState(v.amount ?? "");
  const [includesVat, setIncludesVat] = useState(v.includesVat === "on");
  const halalas = parseSarToHalalas(amount);
  const vat = halalas && includesVat ? vatFromGross(halalas, financeConfig.vatRate) : 0;
  const categories = options.categories.filter((c) => c.kind === kind);
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr ? x.nameAr : x.nameEn);
  const moreOpen = !!(v.description || v.reference || e?.description || e?.reference);

  return (
    <form action={action} className="space-y-4" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="kind" value={kind} />
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Field
              name="amount"
              label={t("fields.amount")}
              inputMode="decimal"
              ltr
              required
              autoFocus={!id}
              autoComplete="off"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              error={e?.amount}
              className="[&_input]:text-lg [&_input]:font-semibold"
            />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-800">
              <input type="checkbox" name="includesVat" checked={includesVat} onChange={(ev) => setIncludesVat(ev.target.checked)} className="size-5 rounded border-slate-300 accent-brand" />
              {t("fields.includesVat")}
            </label>
            {includesVat && halalas ? (
              <p className="text-sm text-slate-600" aria-live="polite">
                {t("fields.vatPreview", { vat: formatSar(vat, locale), net: formatSar(halalas - vat, locale) })}
              </p>
            ) : null}
          </div>
          <SelectField name="categoryId" label={t("fields.categoryId")} defaultValue={v.categoryId ?? ""} error={e?.categoryId} required>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
          </SelectField>
          <Field name="date" label={t("fields.date")} type="date" ltr defaultValue={v.date ?? ""} error={e?.date} required />
          <SelectField name="method" label={t("fields.method")} defaultValue={v.method ?? (id ? "" : "CASH")}>
            <option value="">{t("fields.noMethod")}</option>
            {paymentMethods.map((m) => (
              <option key={m} value={m}>
                {ts(`methods.${m}`)}
              </option>
            ))}
          </SelectField>
          <div className="space-y-1.5 sm:col-span-2">
            <SelectField name="siteId" label={`${t("fields.siteId")} (${tc("optional")})`} defaultValue={v.siteId ?? ""} error={e?.siteId}>
              <option value="">{t("noSite")}</option>
              {options.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {name(s.client)}
                </option>
              ))}
            </SelectField>
            <p className="text-sm text-slate-500">{t("fields.siteHint")}</p>
          </div>
        </div>
        <details className="group" open={moreOpen}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-700 [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-slate-400 transition group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90">
              ▸
            </span>
            {t("fields.more")}
          </summary>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field name="description" label={t("fields.description")} defaultValue={v.description ?? ""} error={e?.description} optionalLabel={tc("optional")} autoComplete="off" />
            <Field name="reference" label={t("fields.reference")} defaultValue={v.reference ?? ""} error={e?.reference} optionalLabel={tc("optional")} hint={t("fields.referenceHint")} autoComplete="off" />
          </div>
        </details>
      </Card>
      <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={tc("saving")}>
          {id ? tc("save") : t(`save.${kind}`)}
        </SubmitButton>
      </div>
    </form>
  );
}
