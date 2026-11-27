import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { getOrganization } from "@/features/organizations/service";
import { prisma } from "@/lib/db";
import { countActiveSitesAndWorkers, listExpiringDocuments } from "@/features/workforce/service";
import { daysUntil, todayInRiyadh } from "@/features/master-data/expiry";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, ctx } = await requireOrgPage();
  const t = await getTranslations("dashboard");
  const org = await getOrganization(ctx);
  const [memberCount, expiring, counts, format] = await Promise.all([
    prisma.membership.count({ where: { organizationId: ctx.organizationId } }),
    listExpiringDocuments(ctx),
    countActiveSitesAndWorkers(ctx),
    getFormatter(),
  ]);
  const today = todayInRiyadh();
  const tw = await getTranslations("workers");

  const steps = [
    { label: t("setup.company"), done: true, href: "/app/settings/organization" },
    { label: t("setup.legal"), done: !!(org.crNumber && org.vatNumber), href: "/app/settings/organization#legal" },
    { label: t("setup.logo"), done: !!org.logo, href: "/app/settings/organization#logo" },
    { label: t("setup.bank"), done: !!org.iban, href: "/app/settings/organization#bank" },
    { label: t("setup.team"), done: memberCount > 1, href: "/app/settings/members" },
  ];
  const done = steps.filter((s) => s.done).length;

  return (
    <>
      <PageHeader title={t("welcome", { name: user.name.split(" ")[0] ?? user.name })} subtitle={t("subtitle")} />
      <div className="grid gap-4 lg:grid-cols-3">
        {done < steps.length && ctx.role === "OWNER" ? (
          <Card className="lg:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <CardTitle>{t("setup.title")}</CardTitle>
              <span className="text-sm text-slate-500">{t("setup.progress", { done, total: steps.length })}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100" aria-hidden>
              <div className="h-2 rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {steps.map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex min-h-12 items-center gap-3 rounded-lg px-1 hover:bg-slate-50">
                    <span
                      aria-hidden
                      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? "bg-brand text-white" : "border-2 border-slate-300"}`}
                    >
                      {s.done ? "✓" : ""}
                    </span>
                    <span className={s.done ? "text-slate-500 line-through" : "font-medium text-slate-900"}>{s.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle>{t("expiring.title")}</CardTitle>
            {expiring.length > 0 ? (
              <Link href="/app/workforce?expiry=soon" className="text-sm font-medium text-brand hover:underline">
                {t("expiring.viewAll")}
              </Link>
            ) : null}
          </div>
          {counts.workers === 0 ? (
            <p className="mt-2 text-slate-600">
              <Link href="/app/workforce" className="font-medium text-brand hover:underline">
                {t("expiring.noWorkers")}
              </Link>
            </p>
          ) : expiring.length === 0 ? (
            <p className="mt-2 text-slate-600">{t("expiring.none")}</p>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-amber-800">{t("expiring.count", { count: expiring.length })}</p>
              <ul className="mt-2 divide-y divide-slate-100">
                {expiring.slice(0, 5).map((d) => {
                  const days = daysUntil(d.expiresOn, today);
                  return (
                    <li key={`${d.workerId}-${d.document}`}>
                      <Link href={`/app/workforce/${d.workerId}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 hover:bg-slate-50">
                        <span className="min-w-0 truncate text-sm text-slate-900">
                          {d.name} <span className="text-slate-500">· {tw(`docs.${d.document}`)}</span>
                        </span>
                        <Badge tone={days < 0 ? "danger" : "warning"}>
                          {days < 0
                            ? tw("expiry.expiredOn", { date: format.dateTime(d.expiresOn, { dateStyle: "medium", timeZone: "UTC" }) })
                            : tw("expiry.expiresIn", { days })}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
        <Card>
          <CardTitle>{t("sites.title")}</CardTitle>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{counts.sites}</p>
          <p className="text-sm text-slate-600">{t("sites.workers", { count: counts.workers })}</p>
          <Link href={counts.sites === 0 ? "/app/sites/new" : "/app/sites"} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">
            {counts.sites === 0 ? t("sites.add") : t("sites.manage")}
          </Link>
        </Card>
        <Card>
          <CardTitle>{t("next.title")}</CardTitle>
          <p className="mt-2 text-slate-600">{t("next.body")}</p>
        </Card>
      </div>
    </>
  );
}
