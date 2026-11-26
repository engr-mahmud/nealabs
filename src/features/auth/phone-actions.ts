"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { UnauthorizedError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { setPendingPhone, verifyPhoneCode } from "./phone-verification";
import { sendVerificationSms } from "./phone-sms";
import { phoneFormSchema, safeNextPath, verifyCodeSchema } from "./schemas";
import { getSession } from "./session";

async function requireSessionAction() {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

export async function resendCodeAction(): Promise<ActionState> {
  try {
    const session = await requireSessionAction();
    await sendVerificationSms(session.userId);
  } catch (e) {
    return actionError(e);
  }
  return { ok: true, message: (await getTranslations("verify"))("sent") };
}

export async function changePhoneAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(phoneFormSchema, formData);
  if (error) return error;
  try {
    const session = await requireSessionAction();
    await setPendingPhone(session.userId, data.phone);
    await sendVerificationSms(session.userId);
  } catch (e) {
    return actionError(e, formData);
  }
  const next = safeNextPath(formData.get("next"));
  redirect(next ? `/verify-phone?next=${encodeURIComponent(next)}` : "/verify-phone");
}

export async function verifyCodeAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(verifyCodeSchema, formData);
  if (error) return error;
  try {
    const session = await requireSessionAction();
    await rateLimit(`verify:user:${session.userId}`, 20, 15 * 60);
    await verifyPhoneCode(session.userId, data.code);
  } catch (e) {
    return actionError(e);
  }
  redirect(safeNextPath(formData.get("next")) ?? "/onboarding");
}
