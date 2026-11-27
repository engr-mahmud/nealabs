import { tenantDb } from "@/lib/db";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { financeSummary } from "@/features/finance/report";
import { presetRange } from "@/features/finance/period";
import { unpaidSalaries } from "@/features/payroll/service";
import { receivablesSummary } from "@/features/sales/service";
import { countActiveSitesAndWorkers, listExpiringDocuments } from "@/features/workforce/service";

/** Sales documents waiting for the next step: invoices to issue, offers to turn into invoices. */
export async function pendingSalesWork(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  const db = tenantDb(ctx.organizationId);
  const open = { status: "SENT" as const, convertedTo: { is: null } };
  const [drafts, proformas, quotations] = await Promise.all([
    db.salesDocument.aggregate({ where: { type: "INVOICE", status: "DRAFT" }, _sum: { total: true }, _count: { _all: true } }),
    db.salesDocument.aggregate({ where: { type: "PROFORMA", ...open }, _sum: { total: true }, _count: { _all: true } }),
    db.salesDocument.aggregate({ where: { type: "QUOTATION", ...open }, _sum: { total: true }, _count: { _all: true } }),
  ]);
  const pick = (a: typeof drafts) => ({ count: a._count._all, total: a._sum.total ?? 0 });
  return { draftInvoices: pick(drafts), openProformas: pick(proformas), openQuotations: pick(quotations) };
}

/**
 * Everything the dashboard's six cards need, in one round of parallel queries.
 * Reuses the same functions as the full pages so the numbers always match.
 */
export async function dashboardData(ctx: OrgContext, now = new Date()) {
  assertCan(ctx, "data.read");
  const today = todayInRiyadh(now);
  const thisMonth = presetRange("this-month", today);
  const lastMonth = presetRange("last-month", today);
  const [expiring, counts, receivables, pending, salaries, month, prevMonth] = await Promise.all([
    listExpiringDocuments(ctx, now),
    countActiveSitesAndWorkers(ctx),
    receivablesSummary(ctx, now),
    pendingSalesWork(ctx),
    unpaidSalaries(ctx),
    financeSummary(ctx, thisMonth),
    financeSummary(ctx, lastMonth),
  ]);
  return {
    today,
    expiring: {
      total: expiring.length,
      expired: expiring.filter((d) => d.expiresOn < today).length,
      top: expiring.slice(0, 4),
    },
    sites: counts,
    receivables,
    pending,
    salaries,
    month: {
      from: thisMonth.from!,
      income: month.incomeNet,
      expense: month.expenseNet,
      profit: month.profit,
      lastMonthProfit: prevMonth.profit,
      hasLastMonth: prevMonth.incomeNet !== 0 || prevMonth.expenseNet !== 0,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
