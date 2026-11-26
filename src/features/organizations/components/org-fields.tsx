"use client";

import { useTranslations } from "next-intl";
import { Field } from "@/components/ui/field";

import type { OrgValues } from "../form-values";
export type { OrgValues };

interface SectionProps {
  values: OrgValues;
  errors?: Record<string, string>;
  disabled?: boolean;
}

const val = (v: string | null | undefined) => v ?? "";

export function CompanyNameFields({ values, errors, disabled }: SectionProps) {
  const t = useTranslations("org.fields");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("nameEn")} name="nameEn" required autoComplete="organization" dir="ltr" defaultValue={val(values.nameEn)} error={errors?.nameEn} disabled={disabled} />
      <Field label={t("nameAr")} name="nameAr" dir="rtl" lang="ar" defaultValue={val(values.nameAr)} error={errors?.nameAr} disabled={disabled} />
    </div>
  );
}

export function LegalFields({ values, errors, disabled }: SectionProps) {
  const t = useTranslations("org");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("fields.crNumber")} name="crNumber" inputMode="numeric" ltr defaultValue={val(values.crNumber)} error={errors?.crNumber} disabled={disabled} />
      <Field
        label={t("fields.vatNumber")}
        name="vatNumber"
        inputMode="numeric"
        ltr
        hint={t("hints.vatNumber")}
        defaultValue={val(values.vatNumber)}
        error={errors?.vatNumber}
        disabled={disabled}
      />
      <Field label={t("fields.addressLine")} name="addressLine" autoComplete="street-address" className="sm:col-span-2" defaultValue={val(values.addressLine)} error={errors?.addressLine} disabled={disabled} />
      <Field label={t("fields.city")} name="city" autoComplete="address-level2" defaultValue={val(values.city)} error={errors?.city} disabled={disabled} />
      <Field label={t("fields.postalCode")} name="postalCode" inputMode="numeric" autoComplete="postal-code" ltr defaultValue={val(values.postalCode)} error={errors?.postalCode} disabled={disabled} />
    </div>
  );
}

export function BankFields({ values, errors, disabled }: SectionProps) {
  const t = useTranslations("org");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("fields.bankName")} name="bankName" defaultValue={val(values.bankName)} error={errors?.bankName} disabled={disabled} />
      <Field label={t("fields.bankAccountName")} name="bankAccountName" defaultValue={val(values.bankAccountName)} error={errors?.bankAccountName} disabled={disabled} />
      <Field
        label={t("fields.iban")}
        name="iban"
        ltr
        autoCapitalize="characters"
        hint={t("hints.iban")}
        className="sm:col-span-2"
        placeholder="SA00 0000 0000 0000 0000 0000"
        defaultValue={val(values.iban)}
        error={errors?.iban}
        disabled={disabled}
      />
    </div>
  );
}
