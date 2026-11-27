import type { FinanceKind } from "@/generated/prisma/enums";
import { tenantDb } from "@/lib/db";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { dateFilter, type Period } from "./period";
import { sumByKind } from "./service";

/**
 * Reports are cash basis (money received and paid in the period) and show profit
 * without VAT: VAT collected is owed to the government and VAT paid is reclaimed.
 */

export interface CategoryRow {
  categoryId: string;
  kind: FinanceKind;
  nameEn: string;
  nameAr: string | null;
  /** Without VAT. */
  net: number;
  count: number;
}

export interface SiteRow {
  /** null = entries without a site (company overhead). */
  siteId: string | null;
  siteName: string | null;
  clientName: string | null;
  clientNameAr: string | null;
  archived: boolean;
  income: number;
  expense: number;
  profit: number;
  /** Profit as basis points of income (null when there is no income). */
  marginBp: number | null;
}

export function marginBp(profit: number, income: number): number | null {
  if (income <= 0) return null;
  return Math.round((profit * 10_000) / income);
}

function baseWhere(period: Period) {
  const date = dateFilter(period);
  return { voidedAt: null, ...(date ? { date } : {}) };
}

export async function financeSummary(ctx: OrgContext, period: Period) {
  assertCan(ctx, "data.read");
  const db = tenantDb(ctx.organizationId);
  const where = baseWhere(period);
  const [kindGroups, catGroups] = await Promise.all([
    db.financeEntry.groupBy({ by: ["kind"], where, _sum: { amount: true, vatAmount: true } }),
    db.financeEntry.groupBy({ by: ["kind", "categoryId"], where, _sum: { amount: true, vatAmount: true }, _count: { _all: true } }),
  ]);
  const t = sumByKind(kindGroups);
  const categories = await db.financeCategory.findMany({
    where: { id: { in: catGroups.map((g) => g.categoryId) } },
    select: { id: true, nameEn: true, nameAr: true },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows: CategoryRow[] = catGroups
    .map((g) => ({
      categoryId: g.categoryId,
      kind: g.kind,
      nameEn: byId.get(g.categoryId)?.nameEn ?? "",
      nameAr: byId.get(g.categoryId)?.nameAr ?? null,
      net: (g._sum.amount ?? 0) - (g._sum.vatAmount ?? 0),
      count: g._count._all,
    }))
    .sort((a, b) => b.net - a.net);
  const incomeNet = t.income - t.incomeVat;
  const expenseNet = t.expense - t.expenseVat;
  return {
    incomeNet,
    expenseNet,
    profit: incomeNet - expenseNet,
    marginBp: marginBp(incomeNet - expenseNet, incomeNet),
    /** VAT on income minus VAT on expenses, from these entries only. Not a VAT return. */
    vat: { collected: t.incomeVat, paid: t.expenseVat, net: t.incomeVat - t.expenseVat },
    gross: { income: t.income, expense: t.expense },
    income: rows.filter((r) => r.kind === "INCOME"),
    expense: rows.filter((r) => r.kind === "EXPENSE"),
  };
}

/** Income, expense and profit per site (without VAT), best first; overhead (no site) last. */
export async function siteProfitReport(ctx: OrgContext, period: Period) {
  assertCan(ctx, "data.read");
  const db = tenantDb(ctx.organizationId);
  const groups = await db.financeEntry.groupBy({ by: ["siteId", "kind"], where: baseWhere(period), _sum: { amount: true, vatAmount: true } });
  const siteIds = [...new Set(groups.map((g) => g.siteId).filter((s): s is string => !!s))];
  const sites = await db.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true, archivedAt: true, client: { select: { nameEn: true, nameAr: true } } } });
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const rows = new Map<string | null, SiteRow>();
  for (const g of groups) {
    let row = rows.get(g.siteId);
    if (!row) {
      const site = g.siteId ? siteById.get(g.siteId) : undefined;
      row = {
        siteId: g.siteId,
        siteName: site?.name ?? null,
        clientName: site?.client.nameEn ?? null,
        clientNameAr: site?.client.nameAr ?? null,
        archived: !!site?.archivedAt,
        income: 0,
        expense: 0,
        profit: 0,
        marginBp: null,
      };
      rows.set(g.siteId, row);
    }
    const net = (g._sum.amount ?? 0) - (g._sum.vatAmount ?? 0);
    if (g.kind === "INCOME") row.income += net;
    else row.expense += net;
  }
  const list = [...rows.values()].map((r) => ({ ...r, profit: r.income - r.expense, marginBp: marginBp(r.income - r.expense, r.income) }));
  list.sort((a, b) => (a.siteId === null ? 1 : b.siteId === null ? -1 : b.profit - a.profit));
  const totals = list.reduce((s, r) => ({ income: s.income + r.income, expense: s.expense + r.expense }), { income: 0, expense: 0 });
  return { rows: list, totals: { ...totals, profit: totals.income - totals.expense, marginBp: marginBp(totals.income - totals.expense, totals.income) } };
}
