import { getFormatter, getTranslations } from "next-intl/server";
import { masterDataConfig } from "@/config/master-data";
import { prisma, systemDb } from "@/lib/db";
import { emailLayout, sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { isLocale, localeDir } from "@/i18n/config";
import { daysUntil, todayInRiyadh } from "@/features/master-data/expiry";

const DAY_MS = 24 * 60 * 60 * 1000;

interface DueDocument {
  name: string;
  document: "iqama" | "passport";
  expiresOn: Date;
}

/**
 * Daily job: emails each company's owners and accountants when a worker's Iqama or
 * passport is 30, 14, 7 or 1 days from expiry, or expires today. Runs across all
 * companies (system job, RLS bypassed). Safe to call more than once a day: each
 * company gets at most one email per day. Emails contain names and dates only,
 * never Iqama or passport numbers.
 */
export async function sendExpiryReminders(now = new Date()) {
  const today = todayInRiyadh(now);
  const dates = masterDataConfig.reminderDays.map((d) => new Date(today.getTime() + d * DAY_MS));
  const workers = await systemDb().worker.findMany({
    where: {
      archivedAt: null,
      organization: { archivedAt: null },
      OR: [{ iqamaExpiry: { in: dates } }, { passportExpiry: { in: dates } }],
    },
    select: { organizationId: true, name: true, iqamaExpiry: true, passportExpiry: true },
  });

  const byOrg = new Map<string, DueDocument[]>();
  const due = (d: Date | null) => !!d && dates.some((x) => x.getTime() === d.getTime());
  for (const w of workers) {
    const list = byOrg.get(w.organizationId) ?? [];
    if (due(w.iqamaExpiry)) list.push({ name: w.name, document: "iqama", expiresOn: w.iqamaExpiry! });
    if (due(w.passportExpiry)) list.push({ name: w.name, document: "passport", expiresOn: w.passportExpiry! });
    byOrg.set(w.organizationId, list);
  }

  let emails = 0;
  let companies = 0;
  const day = today.toISOString().slice(0, 10);
  for (const [organizationId, docs] of byOrg) {
    // One email per company per day, even if the job runs twice.
    const claimed = await prisma.$queryRaw<{ key: string }[]>`
      INSERT INTO rate_limits (key, count, "windowStart") VALUES (${`expiry-reminder:${organizationId}:${day}`}, 1, now())
      ON CONFLICT (key) DO NOTHING RETURNING key`;
    if (claimed.length === 0) continue;
    companies += 1;
    docs.sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime());

    const [org, members] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { nameEn: true, nameAr: true } }),
      prisma.membership.findMany({ where: { organizationId }, select: { user: { select: { email: true, locale: true } } } }),
    ]);
    for (const { user } of members) {
      const locale = isLocale(user.locale) ? user.locale : "en";
      const t = await getTranslations({ locale, namespace: "email.expiry" });
      const tw = await getTranslations({ locale, namespace: "workers.docs" });
      const format = await getFormatter({ locale });
      const orgName = locale === "ar" && org.nameAr ? org.nameAr : org.nameEn;
      const lines = docs.map((d) => {
        const date = format.dateTime(d.expiresOn, { dateStyle: "medium", timeZone: "UTC" });
        const when = daysUntil(d.expiresOn, today) <= 0 ? t("expiredLine", { date }) : t("expiresLine", { date });
        return t("line", { name: d.name, document: tw(d.document), when });
      });
      const url = `${env().APP_URL}/app/workforce?expiry=soon`;
      await sendEmail({
        to: user.email,
        subject: t("subject", { count: docs.length, org: orgName }),
        text: `${t("body", { org: orgName })}\n\n${lines.join("\n")}\n\n${url}\n\n${t("footer", { org: orgName })}`,
        html: emailLayout({ dir: localeDir(locale), heading: t("heading"), body: t("body", { org: orgName }), lines, cta: { label: t("cta"), url }, footer: t("footer", { org: orgName }) }),
      });
      emails += 1;
    }
  }
  return { companies, emails };
}
