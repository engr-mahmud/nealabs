import type { FinanceKind } from "@/generated/prisma/enums";
import { tenantDb } from "@/lib/db";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { daysUntil, todayInRiyadh } from "@/features/master-data/expiry";

// ---------------------------------------------------------------- receivables aging

export const agingBuckets = ["current", "d1_30", "d31_60", "d61_90", "d90plus"] as const;
export type AgingBucket = (typeof agingBuckets)[number];

/** Which bucket an unpaid invoice falls in, by days past its due date. No due date = current. */
export function agingBucket(dueDate: Date | null, today: Date): AgingBucket {
  if (!dueDate) return "current";
  const late = -daysUntil(dueDate, today);
  if (late <= 0) return "current";
  if (late <= 30) return "d1_30";
  if (late <= 60) return "d31_60";
  if (late <= 90) return "d61_90";
  return "d90plus";
}

type Buckets = Record<AgingBucket, number>;
const emptyBuckets = (): Buckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 });

export interface AgingRow {
  clientId: string;
  nameEn: string;
  nameAr: string | null;
  invoices: number;
  /** Days past due of the oldest unpaid invoice (0 when nothing is late). */
  oldestLateDays: number;
  buckets: Buckets;
  total: number;
}

/** Money still to collect on issued invoices, per client and by how late it is. Biggest balance first. */
export async function receivablesAging(ctx: OrgContext, now = new Date()) {
  assertCan(ctx, "data.read");
  const today = todayInRiyadh(now);
  const invoices = await tenantDb(ctx.organizationId).salesDocument.findMany({
    where: { type: "INVOICE", status: "SENT", balance: { gt: 0 } },
    select: { clientId: true, dueDate: true, balance: true, client: { select: { nameEn: true, nameAr: true } } },
  });
  const rows = new Map<string, AgingRow>();
  const totals = { ...emptyBuckets(), total: 0, invoices: 0 };
  for (const inv of invoices) {
    let row = rows.get(inv.clientId);
    if (!row) {
      row = { clientId: inv.clientId, nameEn: inv.client.nameEn, nameAr: inv.client.nameAr, invoices: 0, oldestLateDays: 0, buckets: emptyBuckets(), total: 0 };
      rows.set(inv.clientId, row);
    }
    const bucket = agingBucket(inv.dueDate, today);
    row.buckets[bucket] += inv.balance;
    row.total += inv.balance;
    row.invoices += 1;
    if (inv.dueDate) row.oldestLateDays = Math.max(row.oldestLateDays, -daysUntil(inv.dueDate, today));
    totals[bucket] += inv.balance;
    totals.total += inv.balance;
    totals.invoices += 1;
  }
  return { today, rows: [...rows.values()].sort((a, b) => b.total - a.total || a.nameEn.localeCompare(b.nameEn)), totals };
}

// ---------------------------------------------------------------- monthly trend

export interface MonthRow {
  /** First day of the month (UTC midnight). */
  month: Date;
  income: number;
  expense: number;
  profit: number;
}

/** The `count` calendar months ending with the month of `today`, oldest first. */
export function lastMonths(today: Date, count: number): Date[] {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - (count - 1 - i), 1)));
}

/** Adds daily totals into months. Amounts are without VAT, like the other finance reports. */
export function sumByMonth(
  groups: { date: Date; kind: FinanceKind; _sum: { amount: number | null; vatAmount: number | null } }[],
  months: Date[],
): MonthRow[] {
  const rows = months.map((month) => ({ month, income: 0, expense: 0, profit: 0 }));
  const index = new Map(months.map((m, i) => [`${m.getUTCFullYear()}-${m.getUTCMonth()}`, i]));
  for (const g of groups) {
    const i = index.get(`${g.date.getUTCFullYear()}-${g.date.getUTCMonth()}`);
    if (i === undefined) continue;
    const net = (g._sum.amount ?? 0) - (g._sum.vatAmount ?? 0);
    const row = rows[i]!;
    if (g.kind === "INCOME") row.income += net;
    else row.expense += net;
  }
  for (const r of rows) r.profit = r.income - r.expense;
  return rows;
}

/** Income, expense and profit (without VAT, cash basis) for each of the last `count` months. */
export async function monthlyTrend(ctx: OrgContext, count = 12, now = new Date()) {
  assertCan(ctx, "data.read");
  const months = lastMonths(todayInRiyadh(now), count);
  const groups = await tenantDb(ctx.organizationId).financeEntry.groupBy({
    by: ["date", "kind"],
    where: { voidedAt: null, date: { gte: months[0]! } },
    _sum: { amount: true, vatAmount: true },
  });
  const rows = sumByMonth(groups, months);
  const totals = rows.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }), { income: 0, expense: 0 });
  return { rows, totals: { ...totals, profit: totals.income - totals.expense } };
}
