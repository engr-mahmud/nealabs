"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { changePhoneAction, resendCodeAction, verifyCodeAction } from "../phone-actions";

export function VerifyCodeForm({ next }: { next?: string }) {
  const t = useTranslations("verify");
  const [state, action] = useActionState(verifyCodeAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={t("code")}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        ltr
        required
        autoFocus
        className="[&_input]:text-center [&_input]:text-2xl [&_input]:tracking-[0.5em]"
        error={state?.fieldErrors?.code}
      />
      <SubmitButton size="lg" className="w-full">
        {t("submit")}
      </SubmitButton>
    </form>
  );
}

export function ResendCodeForm({ primary }: { primary?: boolean }) {
  const t = useTranslations("verify");
  const [state, action] = useActionState(resendCodeAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.message ? <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert> : null}
      <SubmitButton variant={primary ? "primary" : "secondary"} size={primary ? "lg" : "md"} className="w-full">
        {t("resend")}
      </SubmitButton>
    </form>
  );
}

export function PhoneForm({ next, submitLabel }: { next?: string; submitLabel: string }) {
  const t = useTranslations();
  const [state, action] = useActionState(changePhoneAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={t("auth.fields.phone")}
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="05X XXX XXXX"
        ltr
        required
        defaultValue={state?.values?.phone}
        error={state?.fieldErrors?.phone}
      />
      <SubmitButton size="lg" className="w-full">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
