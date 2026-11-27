"use client";

import { useActionState, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { masterDataConfig } from "@/config/master-data";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatSar } from "@/lib/money";
import { parseSarToHalalas } from "@/lib/parse";
import { saveWorkerAction } from "../actions";

export type WorkerValues = Partial<Record<string, string | null>>;

export interface SiteGroup {
  client: string;
  sites: { id: string; name: string }[];
}

const MONEY = ["basicSalary", "housingAllowance", "transportAllowance", "otherAllowance"] as const;

export function WorkerForm({
  id,
  values,
  siteGroups,
  masked,
  disabled,
}: {
  id?: string;
  values: WorkerValues;
  siteGroups: SiteGroup[];
  /** On edit: last 4 digits of the stored numbers (the full numbers are never sent to the form). */
  masked?: { iqama: string; passport: string | null };
  disabled?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [state, action] = useActionState(saveWorkerAction, null);
  const v = state?.values ?? values;
  const e = state?.fieldErrors;
  const f = (name: string) => ({ name, defaultValue: v[name] ?? "", error: e?.[name], disabled, label: t(`workers.fields.${name}`) });
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(MONEY.map((k) => [k, v[k] ?? ""])));
  const total = MONEY.reduce((sum, k) => sum + (parseSarToHalalas(amounts[k] || "0") ?? 0), 0);

  return (
    <form action={action} className="space-y-4" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}

      <Card>
        <CardTitle className="mb-4">{t("workers.sections.personal")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...f("name")} required autoComplete="off" />
          <Field
            {...f("iqamaNumber")}
            required={!id}
            inputMode="numeric"
            ltr
            autoComplete="off"
            placeholder={masked ? `•••• ${masked.iqama}` : "2XXXXXXXXX"}
            hint={masked ? t("workers.keepNumber", { masked: `•••• ${masked.iqama}` }) : undefined}
          />
          <Field {...f("nationality")} list="nationalities" autoComplete="off" />
          <datalist id="nationalities">
            {masterDataConfig.nationalities.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Field {...f("jobTitle")} autoComplete="off" />
          <Field {...f("phone")} type="tel" inputMode="tel" ltr placeholder="05X XXX XXXX" optionalLabel={t("common.optional")} />
          <Field {...f("nameAr")} dir="rtl" lang="ar" optionalLabel={t("common.optional")} />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">{t("workers.sections.work")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("workers.fields.site")} name="siteId" defaultValue={v.siteId ?? ""} error={e?.siteId} disabled={disabled} className="sm:col-span-2">
            <option value="">{t("workers.noSite")}</option>
            {siteGroups.map((g) => (
              <optgroup key={g.client} label={g.client}>
                {g.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
          {MONEY.map((k) => (
            <Field
              key={k}
              {...f(k)}
              inputMode="decimal"
              ltr
              placeholder="0"
              onChange={(ev) => setAmounts((a) => ({ ...a, [k]: ev.target.value }))}
            />
          ))}
          <p className="text-sm text-slate-600 sm:col-span-2" aria-live="polite">
            {t("workers.monthlyTotal")}: <strong className="text-slate-900">{formatSar(total, locale)}</strong>
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-4">{t("workers.sections.documents")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field {...f("iqamaExpiry")} type="date" ltr />
          <div className="hidden sm:block" />
          <Field
            {...f("passportNumber")}
            ltr
            autoCapitalize="characters"
            autoComplete="off"
            placeholder={masked?.passport ? `•••• ${masked.passport}` : undefined}
            hint={masked?.passport ? t("workers.keepNumber", { masked: `•••• ${masked.passport}` }) : undefined}
          />
          <Field {...f("passportExpiry")} type="date" ltr />
          {masked?.passport && !disabled ? (
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" name="clearPassport" className="size-5" />
              {t("workers.clearPassport")}
            </label>
          ) : null}
        </div>
      </Card>

      {disabled ? null : (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:border-0 sm:bg-transparent sm:p-0">
          <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={t("common.saving")}>
            {id ? t("common.save") : t("workers.add")}
          </SubmitButton>
          {id ? null : (
            <SubmitButton size="lg" variant="secondary" name="addAnother" value="1" className="w-full sm:w-auto">
              {t("workers.saveAndAdd")}
            </SubmitButton>
          )}
        </div>
      )}
    </form>
  );
}
