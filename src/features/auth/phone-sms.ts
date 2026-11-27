// Not a "use server" module on purpose: this takes a userId, so it must never be callable from the browser.
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { brand } from "@/config/brand";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/sms";
import { isLocale } from "@/i18n/config";
import { createPhoneCode } from "./phone-verification";

const HOUR = 60 * 60;
export const DEMO_CODE_COOKIE = "demo_sms_code";

/** Creates a code and sends it by SMS. Rate limited per account, number and IP (SMS costs money). */
export async function sendVerificationSms(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingPhone: true, locale: true } });
  await rateLimit(`sms:user:${userId}`, 5, HOUR);
  if (user.pendingPhone) await rateLimit(`sms:phone:${user.pendingPhone}`, 5, HOUR);
  await rateLimit(`sms:ip:${await getClientIp()}`, 20, HOUR);
  const { code, phone } = await createPhoneCode(userId);
  const locale = isLocale(user.locale) ? user.locale : "en";
  const t = await getTranslations({ locale, namespace: "sms" });
  await sendSms(phone, t("code", { brand: brand.productShortName, code }));
  // Demo servers have no SMS provider: hand the code to this browser only, so the verify page can show it.
  if (env().SMS_TRANSPORT === "demo") {
    (await cookies()).set(DEMO_CODE_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: env().NODE_ENV === "production", maxAge: 10 * 60, path: "/verify-phone" });
  }
}

