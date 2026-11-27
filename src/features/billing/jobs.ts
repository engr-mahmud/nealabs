import "server-only";
import { billingConfig } from "@/config/plans";
import { prisma, systemDb } from "@/lib/db";
import { emailLayout, sendEmail } from "@/lib/email";
import { emailFormatter, emailTranslator } from "@/lib/email-i18n";
import { env } from "@/lib/env";
import { isLocale, localeDir } from "@/i18n/config";
import { PAST_DUE_GRACE_DAYS } from "./access";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Daily billing job (system, RLS bypassed). Safe to run more than once a day.
 * 1. Stored status follows the clock: unpaid ACTIVE → PAST_DUE at period end,
 *    PAST_DUE → EXPIRED after the grace days, TRIALING → EXPIRED at trial end.
 *    (Access is already computed from dates on every request; this keeps reports
 *    and emails right.) Data is never deleted.
 * 2. Rolls over renewals paid early with another plan once they start.
 *    A renewal paid early moves the period end, so it gets no reminder.
 * 3. Reminder emails 7 and 1 days before a trial or paid period ends, and one email
 *    when a company turns read-only. Each at most once per company and date.
 * 4. Closes checkouts left unpaid for 48 hours.
 */
export async function runBillingJobs(now = new Date()) {
  const db = systemDb();

  const rolled = await db.subscription.findMany({ where: { scheduledFrom: { lte: now } }, select: { id: true, scheduledPlanCode: true, scheduledCycle: true } });
  for (const s of rolled) {
    await db.subscription.update({ where: { id: s.id }, data: { planCode: s.scheduledPlanCode, billingCycle: s.scheduledCycle, scheduledPlanCode: null, scheduledCycle: null, scheduledFrom: null } });
  }

  const pastDue = await db.subscription.updateMany({ where: { status: "ACTIVE", currentPeriodEnd: { lte: now } }, data: { status: "PAST_DUE" } });
  const graceStart = new Date(now.getTime() - PAST_DUE_GRACE_DAYS * DAY_MS);
  const toExpire = await db.subscription.findMany({
    where: {
      OR: [
        { status: "PAST_DUE", currentPeriodEnd: { lte: graceStart } },
        { status: "TRIALING", trialEndsAt: { lte: now } },
        { status: "CANCELED", currentPeriodEnd: { lte: now } },
      ],
    },
    select: { id: true, organizationId: true },
  });
  for (const s of toExpire) {
    await db.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } });
    await notify(s.organizationId, "readOnly", now, null);
  }

  const expiredCheckouts = await db.billingCheckout.updateMany({
    where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - billingConfig.checkoutExpiryHours * HOUR_MS) } },
    data: { status: "EXPIRED" },
  });

  let reminders = 0;
  for (const days of billingConfig.reminderDays) {
    // Everything ending within that day, counted from now.
    const from = new Date(now.getTime() + (days - 1) * DAY_MS);
    const to = new Date(now.getTime() + days * DAY_MS);
    const due = await db.subscription.findMany({
      where: {
        organization: { archivedAt: null },
        OR: [
          { status: "TRIALING", trialEndsAt: { gt: from, lte: to } },
          { status: "ACTIVE", currentPeriodEnd: { gt: from, lte: to } },
        ],
      },
      select: { organizationId: true, status: true, trialEndsAt: true, currentPeriodEnd: true, planCode: true },
    });
    for (const s of due) {
      const end = s.status === "TRIALING" ? s.trialEndsAt : s.currentPeriodEnd!;
      if (await notify(s.organizationId, s.status === "TRIALING" ? "trialEnding" : "renewal", now, { days, end, plan: s.planCode })) reminders += 1;
    }
  }

  return { rolledOver: rolled.length, pastDue: pastDue.count, expired: toExpire.length, expiredCheckouts: expiredCheckouts.count, reminders };
}

type Kind = "trialEnding" | "renewal" | "readOnly";

/** Emails the company's owners once per company, kind and day. Returns true when sent. */
async function notify(organizationId: string, kind: Kind, now: Date, info: { days: number; end: Date; plan: string | null } | null): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const claimed = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO rate_limits (key, count, "windowStart") VALUES (${`billing-${kind}:${organizationId}:${info?.days ?? 0}:${day}`}, 1, now())
    ON CONFLICT (key) DO NOTHING RETURNING key`;
  if (claimed.length === 0) return false;

  const [org, owners] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { nameEn: true, nameAr: true } }),
    prisma.membership.findMany({ where: { organizationId, role: "OWNER" }, select: { user: { select: { email: true, locale: true } } } }),
  ]);
  const url = `${env().APP_URL}/app/billing`;
  for (const { user } of owners) {
    const locale = isLocale(user.locale) ? user.locale : "en";
    const t = emailTranslator(locale, `email.${kind}`);
    const tp = emailTranslator(locale, "billing.planNames");
    const format = emailFormatter(locale);
    const orgName = locale === "ar" && org.nameAr ? org.nameAr : org.nameEn;
    const values = {
      org: orgName,
      days: info?.days ?? 0,
      date: info ? format.dateTime(info.end, { dateStyle: "long", timeZone: "Asia/Riyadh" }) : "",
      plan: info?.plan ? tp(info.plan) : "",
    };
    await sendEmail({
      to: user.email,
      subject: t("subject", values),
      text: `${t("body", values)}\n\n${url}\n\n${t("footer", values)}`,
      html: emailLayout({ dir: localeDir(locale), heading: t("heading", values), body: t("body", values), cta: { label: t("cta"), url }, footer: t("footer", values) }),
    });
  }
  return true;
}
