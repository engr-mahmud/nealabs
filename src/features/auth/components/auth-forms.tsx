"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action";
import { forgotPasswordAction, resetPasswordAction, signInAction, signUpAction } from "../actions";

function FormMessage({ state }: { state: ActionState | null }) {
  if (!state?.message) return null;
  return <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>;
}

export function SignInForm({ next, defaultEmail }: { next?: string; defaultEmail?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signInAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        ltr
        required
        defaultValue={state?.values?.email ?? defaultEmail}
        error={state?.fieldErrors?.email}
      />
      <Field
        label={t("fields.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state?.fieldErrors?.password}
      />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">
          {t("signIn.forgot")}
        </Link>
      </div>
      <SubmitButton size="lg" className="w-full">
        {t("signIn.submit")}
      </SubmitButton>
    </form>
  );
}

export function SignUpForm({ next, defaultEmail }: { next?: string; defaultEmail?: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(signUpAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={t("fields.name")}
        name="name"
        autoComplete="name"
        required
        defaultValue={state?.values?.name}
        error={state?.fieldErrors?.name}
      />
      <Field
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        ltr
        required
        defaultValue={state?.values?.email ?? defaultEmail}
        error={state?.fieldErrors?.email}
      />
      <Field
        label={t("fields.password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={t("passwordHint")}
        error={state?.fieldErrors?.password}
      />
      <SubmitButton size="lg" className="w-full">
        {t("signUp.submit")}
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">{t("signUp.agree")}</p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, action] = useActionState(forgotPasswordAction, null);
  if (state?.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field
        label={t("fields.email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        ltr
        required
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
      />
      <SubmitButton size="lg" className="w-full">
        {t("forgot.submit")}
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth");
  const [state, action] = useActionState(resetPasswordAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field
        label={t("fields.newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint={t("passwordHint")}
        error={state?.fieldErrors?.password}
      />
      <Field
        label={t("fields.confirmPassword")}
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state?.fieldErrors?.confirmPassword}
      />
      <SubmitButton size="lg" className="w-full">
        {t("reset.submit")}
      </SubmitButton>
    </form>
  );
}
