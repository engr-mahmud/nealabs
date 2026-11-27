import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { prisma } from "@/lib/db";
import { requireOrgPage } from "@/features/organizations/current";
import { getOrganization } from "@/features/organizations/service";
import { daysUntil } from "@/features/master-data/expiry";
import { dashboardData } from "@/features/dashboard/service";
import { StatCard } from "@/features/dashboard/components/stat-card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user, ctx } = await requireOrgPage();
  const [t, tw, locale, format, org, memberCount, data] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("workers"),
    getLocale(),
    getFormatter(),
    getOrganization(ctx),
    prisma.membership.count({ where: { organizationId: ctx.organizationId } }),
    dashboardData(ctx),
  ]);
  const money = (h: number) => formatSar(h, locale);
  const { expiring, receivables, pending, salaries, month, sites, today } = data;

  const steps = [
    { label: t("setup.company"), done: true, href: "/app/settings/organization" },
    { label: t("setup.legal"), done: !!(org.crNumber && org.vatNumber), href: "/app/settings/organization#legal" },
    { label: t("setup.logo"), done: !!org.logo, href: "/app/settings/organization#logo" },
    { label: t("setup.bank"), done: !!org.iban, href: "/app/settings/organization#bank" },
    { label: t("setup.team"), done: memberCount > 1, href: "/app/settings/members" },
  ];
  const done = steps.filter((s) => s.done).length;

  const pendingRows = [
    { key: "draftInvoices", href: "/app/sales/invoices?status=draft", ...pending.draftInvoices },
    { key: "openProformas", href: "/app/sales/proformas?status=sent", ...pending.openProformas },
    { key: "openQuotations", href: "/app/sales/quotations?status=sent", ...pending.openQuotations },
  ] as const;
  const pendingCount = pendingRows.reduce((s, r) => s + r.count, 0);
  const barMax = Math.max(month.income, month.expense, 1);
  const monthName = format.dateTime(month.from, { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={t("welcome", { name: user.name.split(" ")[0] ?? user.name })} subtitle={t("subtitle", { date: format.dateTime(today, { dateStyle: "full", timeZone: "UTC" }) })} />

      {done < steps.length && ctx.role === "OWNER" ? (
        <Card className="mb-4">
          <div className="flex items-baseline justify-between gap-2">
            <CardTitle>{t("setup.title")}</CardTitle>
            <span className="text-sm text-slate-500">{t("setup.progress", { done, total: steps.length })}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100" aria-hidden>
            <div className="h-2 rounded-full bg-brand" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {steps
              .filter((s) => !s.done)
              .map((s) => (
                <li key={s.label}>
                  <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-lg px-1 font-medium text-slate-900 hover:bg-slate-50">
                    <span aria-hidden className="inline-flex size-5 shrink-0 rounded-full border-2 border-slate-300" />
                    {s.label}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Money to collect */}
        <StatCard
          title={t("receivables.title")}
          value={money(receivables.outstanding)}
          attention={receivables.overdueCount > 0}
          sub={
            <>
              {t("receivables.unpaid", { count: receivables.unpaidCount })}
              {receivables.overdueCount > 0 ? (
                <span className="mt-1 block font-medium text-red-700">{t("receivables.overdue", { count: receivables.overdueCount, amount: money(receivables.overdueAmount) })}</span>
              ) : null}
            </>
          }
          action={
            receivables.unpaidCount === 0
              ? { href: "/app/sales/invoices/new", label: t("receivables.create") }
              : receivables.overdueCount > 0
                ? { href: "/app/sales/invoices?status=due", label: t("receivables.viewOverdue") }
                : { href: "/app/sales/invoices?status=unpaid", label: t("receivables.view") }
          }
        />

        {/* 2. Sales documents waiting for the next step */}
        <StatCard
          title={t("pending.title")}
          value={pendingCount}
          sub={pendingCount === 0 ? t("pending.none") : t("pending.subtitle")}
          action={pendingCount === 0 ? { href: "/app/sales/quotations/new", label: t("pending.createQuote") } : { href: "/app/sales", label: t("pending.viewSales") }}
        >
          {pendingCount > 0 ? (
            <ul className="divide-y divide-slate-100">
              {pendingRows
                .filter((r) => r.count > 0)
                .map((r) => (
                  <li key={r.key}>
                    <Link href={r.href} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-sm hover:bg-slate-50">
                      <span className="text-slate-800">{t(`pending.${r.key}`, { count: r.count })}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">{money(r.total)}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          ) : null}
        </StatCard>

        {/* 3. Salaries approved but not handed out */}
        <StatCard
          title={t("salaries.title")}
          value={money(salaries.amount)}
          valueClassName={salaries.amount > 0 ? "text-amber-800" : undefined}
          attention={salaries.amount > 0}
          sub={salaries.sheets === 0 ? t("salaries.none") : t("salaries.sheets", { count: salaries.sheets })}
          action={salaries.sheets === 0 ? { href: "/app/payroll", label: t("salaries.view") } : { href: "/app/payroll?status=UNPAID", label: t("salaries.pay") }}
        />

        {/* 4. This month: income vs expense */}
        <StatCard
          title={t("month.title", { month: monthName })}
          value={money(month.profit)}
          valueClassName={month.profit < 0 ? "text-red-700" : undefined}
          sub={
            <>
              {month.profit < 0 ? t("month.loss") : t("month.profit")}
              {month.hasLastMonth ? <span className="text-slate-500"> · {t("month.lastMonth", { amount: money(month.lastMonthProfit) })}</span> : null}
            </>
          }
          action={{ href: "/app/finance/reports", label: t("month.report") }}
        >
          <dl className="space-y-2 text-sm">
            {(
              [
                ["income", month.income, "bg-emerald-500"],
                ["expense", month.expense, "bg-slate-500"],
              ] as const
            ).map(([key, amount, color]) => (
              <div key={key}>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-slate-600">{t(`month.${key}`)}</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{money(amount)}</dd>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cn("h-full rounded-full", color)} style={{ width: `${amount > 0 ? Math.max(2, Math.round((amount / barMax) * 100)) : 0}%` }} />
                </div>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-slate-500">{t("month.note")}</p>
        </StatCard>

        {/* 5. Iqama and passport renewals */}
        <StatCard
          title={t("expiring.title")}
          value={sites.workers === 0 ? undefined : expiring.total}
          valueClassName={expiring.expired > 0 ? "text-red-700" : expiring.total > 0 ? "text-amber-800" : undefined}
          attention={expiring.total > 0}
          sub={
            sites.workers === 0 ? (
              t("expiring.noWorkers")
            ) : expiring.total === 0 ? (
              t("expiring.none")
            ) : (
              <>
                {t("expiring.count", { count: expiring.total })}
                {expiring.expired > 0 ? <span className="font-medium text-red-700"> · {t("expiring.expired", { count: expiring.expired })}</span> : null}
              </>
            )
          }
          action={sites.workers === 0 ? { href: "/app/workforce/new", label: t("expiring.addWorker") } : { href: "/app/workforce?expiry=soon", label: t("expiring.viewAll") }}
        >
          {expiring.top.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {expiring.top.map((d) => {
                const days = daysUntil(d.expiresOn, today);
                return (
                  <li key={`${d.workerId}-${d.document}`}>
                    <Link href={`/app/workforce/${d.workerId}`} className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 hover:bg-slate-50">
                      <span className="min-w-0 truncate text-sm text-slate-900">
                        {d.name} <span className="text-slate-500">· {tw(`docs.${d.document}`)}</span>
                      </span>
                      <Badge tone={days < 0 ? "danger" : "warning"}>
                        {days < 0 ? tw("expiry.expiredOn", { date: format.dateTime(d.expiresOn, { dateStyle: "medium", timeZone: "UTC" }) }) : tw("expiry.expiresIn", { days })}
                      </Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </StatCard>

        {/* 6. Active sites */}
        <StatCard
          title={t("sites.title")}
          value={sites.sites}
          sub={t("sites.workers", { count: sites.workers })}
          action={sites.sites === 0 ? { href: "/app/sites/new", label: t("sites.add") } : { href: "/app/finance/reports", label: t("sites.profit") }}
        />
      </div>
    </>
  );
}
