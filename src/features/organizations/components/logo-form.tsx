"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { FileInput } from "@/components/ui/file-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeLogoAction, uploadLogoAction } from "../actions";
import { LOGO_TYPES } from "../schemas";

export function LogoForm({ hasLogo, disabled }: { hasLogo: boolean; disabled: boolean }) {
  const t = useTranslations("org.logo");
  const [state, action] = useActionState(uploadLogoAction, null);
  if (disabled) return null;
  return (
    <div className="space-y-3">
      {state?.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <FileInput name="logo" required accept={LOGO_TYPES.join(",")} chooseLabel={t("choose")} noFileLabel={t("noFile")} describedBy="logo-hint" />
        <SubmitButton variant="secondary">{t("upload")}</SubmitButton>
        {hasLogo ? (
          <button type="submit" formAction={removeLogoAction} formNoValidate className="min-h-11 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">
            {t("remove")}
          </button>
        ) : null}
      </form>
      <p id="logo-hint" className="text-sm text-slate-500">{t("hint")}</p>
    </div>
  );
}
