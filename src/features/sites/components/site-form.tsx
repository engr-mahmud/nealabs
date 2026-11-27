"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextareaField } from "@/components/ui/textarea-field";
import { saveSiteAction } from "../actions";

export type SiteValues = Partial<Record<string, string | null>>;

export function SiteForm({
  id,
  values,
  clients,
  returnTo,
  disabled,
}: {
  id?: string;
  values: SiteValues;
  clients: { id: string; name: string }[];
  returnTo?: string;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const [state, action] = useActionState(saveSiteAction, null);
  const v = state?.values ?? values;
  const e = state?.fieldErrors;
  const f = (name: string) => ({ name, defaultValue: v[name] ?? "", error: e?.[name], disabled, label: t(`sites.fields.${name}`) });
  return (
    <form action={action} className="space-y-4" noValidate>
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("sites.fields.client")} name="clientId" defaultValue={v.clientId ?? ""} error={e?.clientId} disabled={disabled} required>
            <option value="">{t("validation.chooseClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field {...f("name")} required autoComplete="off" />
          <Field {...f("city")} optionalLabel={t("common.optional")} />
          <Field {...f("address")} optionalLabel={t("common.optional")} />
          <TextareaField {...f("notes")} className="sm:col-span-2" />
        </div>
      </Card>
      {disabled ? null : (
        <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel={t("common.saving")}>
          {id ? t("common.save") : t("sites.add")}
        </SubmitButton>
      )}
    </form>
  );
}
