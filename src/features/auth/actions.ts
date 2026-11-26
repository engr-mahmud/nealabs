"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { env } from "@/lib/env";
import { emailLayout, sendEmail } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { getClientIp } from "@/lib/request";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { localeDir, isLocale } from "@/i18n/config";
import { forgotPasswordSchema, resetPasswordSchema, safeNextPath, signInSchema, signUpSchema } from "./schemas";
import { authenticate, createPasswordResetToken, registerUser, resetPassword } from "./service";
import { endSession, startSession } from "./session";
import { sendVerificationSms } from "./phone-sms";

const FIFTEEN_MIN = 15 * 60;

export async function signUpAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(signUpSchema, formData);
  if (error) return error;
  try {
    await rateLimit(`signup:ip:${await getClientIp()}`, 10, 60 * 60);
    const locale = await getLocale();
    const user = await registerUser({ ...data, locale: isLocale(locale) ? locale : "en" });
    await startSession(user.id);
    await sendVerificationSms(user.id);
  } catch (e) {
    return actionError(e, formData);
  }
  const next = safeNextPath(formData.get("next"));
  redirect(next ? `/verify-phone?next=${encodeURIComponent(next)}` : "/verify-phone");
}

export async function signInAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(signInSchema, formData);
  if (error) return error;
  const emailKey = `login:email:${data.email}`;
  try {
    await rateLimit(`login:ip:${await getClientIp()}`, 30, FIFTEEN_MIN);
    await rateLimit(emailKey, 10, FIFTEEN_MIN);
    const user = await authenticate(data.email, data.password);
    if (!user) throw new AppError("invalidCredentials");
    await resetRateLimit(emailKey);
    await startSession(user.id);
  } catch (e) {
    return actionError(e, formData);
  }
  redirect(safeNextPath(formData.get("next")) ?? "/app");
}

export async function forgotPasswordAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(forgotPasswordSchema, formData);
  if (error) return error;
  try {
    await rateLimit(`reset:ip:${await getClientIp()}`, 10, FIFTEEN_MIN);
    await rateLimit(`reset:email:${data.email}`, 3, 60 * 60);
    const result = await createPasswordResetToken(data.email);
    if (result) {
      const locale = isLocale(result.user.locale) ? result.user.locale : "en";
      const t = await getTranslations({ locale, namespace: "email.reset" });
      const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(result.token)}`;
      const body = t("body", { name: result.user.name });
      await sendEmail({
        to: result.user.email,
        subject: t("subject"),
        text: `${body}\n\n${url}\n\n${t("footer")}`,
        html: emailLayout({ dir: localeDir(locale), heading: t("heading"), body, cta: { label: t("cta"), url }, footer: t("footer") }),
      });
    }
  } catch (e) {
    return actionError(e, formData);
  }
  // Same answer whether or not the email exists, so accounts cannot be discovered.
  const t = await getTranslations("auth.forgot");
  return { ok: true, message: t("sent") };
}

export async function resetPasswordAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(resetPasswordSchema, formData);
  if (error) return error;
  try {
    await rateLimit(`reset-submit:ip:${await getClientIp()}`, 20, FIFTEEN_MIN);
    const userId = await resetPassword(data.token, data.password);
    await startSession(userId);
  } catch (e) {
    return actionError(e, formData);
  }
  redirect("/app");
}

export async function signOutAction() {
  await endSession();
  redirect("/sign-in");
}
