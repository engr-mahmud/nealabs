import { beforeEach, describe, expect, it } from "vitest";
import { updateOrganization } from "@/features/organizations/service";
import type { OrgContext } from "@/features/organizations/context";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { addPayment, convertSalesDoc, createSalesDoc, issueTaxDocument, markSalesDocSent } from "@/features/sales/service";
import type { SalesDocInput } from "@/features/sales/schemas";
import { createEntry, ensureFinanceSetup, listCategories, voidEntry } from "@/features/finance/service";
import { createWorker } from "@/features/workforce/service";
import { approveSheet, createSheetForActiveWorkers, getSheet, listSheets, markPaid } from "@/features/payroll/service";
import { dashboardData, pendingSalesWork } from "@/features/dashboard/service";
import { agingBucket, lastMonths, monthlyTrend, receivablesAging, sumByMonth } from "@/features/reports/service";
import { addMember, clientInput, orgWithSite, resetDb, workerInput } from "./helpers";
import { createClient } from "@/features/clients/service";

const DAY = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const plusDays = (date: Date, n: number) => new Date(date.getTime() + n * DAY);

function docInput(clientId: string, siteId: string | null, extra: Partial<SalesDocInput> = {}): SalesDocInput {
  return {
    clientId,
    siteId,
    issueDate: null,
    dueDate: null,
    discountType: "NONE",
    discountValue: 0,
    notes: null,
    terms: null,
    // 10 × 100 SAR = 1,000 SAR + 15% VAT = 1,150 SAR.
    lines: [{ description: "Helpers", descriptionAr: null, quantity: 10000, unitPrice: 10000 }],
    ...extra,
  };
}

async function setup(name = "Alpha") {
  const o = await orgWithSite(name);
  await updateOrganization(o.ctx, { nameAr: null, vatNumber: "300000000000003", crNumber: "1010101010" });
  await ensureFinanceSetup(o.ctx);
  return o;
}

async function invoiceDue(ctx: OrgContext, clientId: string, dueDate: Date | null) {
  const draft = await createSalesDoc(ctx, "INVOICE", docInput(clientId, null, { dueDate }));
  await issueTaxDocument(ctx, draft.id);
  return draft.id;
}

async function category(ctx: OrgContext, kind: "INCOME" | "EXPENSE") {
  const c = (await listCategories(ctx)).find((x) => x.kind === kind && !["invoice_payments", "salaries"].includes(x.systemKey ?? ""));
  if (!c) throw new Error("no category");
  return c.id;
}

describe("reports: pure helpers", () => {
  it("puts unpaid invoices in aging buckets by days past due", () => {
    const today = d("2026-11-27");
    expect(agingBucket(null, today)).toBe("current");
    expect(agingBucket(d("2026-12-10"), today)).toBe("current");
    expect(agingBucket(today, today)).toBe("current");
    expect(agingBucket(d("2026-11-26"), today)).toBe("d1_30");
    expect(agingBucket(d("2026-10-28"), today)).toBe("d1_30"); // 30 days
    expect(agingBucket(d("2026-10-27"), today)).toBe("d31_60");
    expect(agingBucket(d("2026-09-28"), today)).toBe("d31_60"); // 60 days
    expect(agingBucket(d("2026-09-27"), today)).toBe("d61_90");
    expect(agingBucket(d("2026-08-29"), today)).toBe("d61_90"); // 90 days
    expect(agingBucket(d("2026-08-28"), today)).toBe("d90plus");
  });

  it("lists the last N months, crossing the year", () => {
    const months = lastMonths(d("2026-02-14"), 4);
    expect(months).toEqual([d("2025-11-01"), d("2025-12-01"), d("2026-01-01"), d("2026-02-01")]);
  });

  it("adds daily totals into months without VAT and ignores other months", () => {
    const months = lastMonths(d("2026-11-27"), 2);
    const rows = sumByMonth(
      [
        { date: d("2026-10-05"), kind: "INCOME", _sum: { amount: 11500, vatAmount: 1500 } },
        { date: d("2026-11-01"), kind: "INCOME", _sum: { amount: 5000, vatAmount: 0 } },
        { date: d("2026-11-30"), kind: "EXPENSE", _sum: { amount: 7000, vatAmount: null } },
        { date: d("2026-09-30"), kind: "INCOME", _sum: { amount: 99999, vatAmount: 0 } },
      ],
      months,
    );
    expect(rows).toEqual([
      { month: d("2026-10-01"), income: 10000, expense: 0, profit: 10000 },
      { month: d("2026-11-01"), income: 5000, expense: 7000, profit: -2000 },
    ]);
  });
});

describe("reports: receivables aging", () => {
  beforeEach(resetDb);

  it("groups balances per client and bucket; payments lower the balance; drafts are left out", async () => {
    const { ctx, client } = await setup();
    const client2 = await createClient(ctx, clientInput("Beta Client"));
    const today = todayInRiyadh();
    const a = await invoiceDue(ctx, client.id, plusDays(today, 120)); // current at T+120
    await invoiceDue(ctx, client.id, plusDays(today, 100)); // 20 days late
    await invoiceDue(ctx, client.id, plusDays(today, 40)); // 80 days late
    await invoiceDue(ctx, client2.id, today); // 120 days late
    await createSalesDoc(ctx, "INVOICE", docInput(client.id, null)); // draft: not a receivable
    await addPayment(ctx, a, { amount: 15000, paidOn: today, method: "CASH" });

    const r = await receivablesAging(ctx, plusDays(new Date(), 120));
    expect(r.totals).toMatchObject({ current: 100000, d1_30: 115000, d31_60: 0, d61_90: 115000, d90plus: 115000, total: 445000, invoices: 4 });
    expect(r.rows.map((x) => x.nameEn)).toEqual(["Alpha Client", "Beta Client"]);
    expect(r.rows[0]).toMatchObject({ invoices: 3, total: 330000, oldestLateDays: 80 });
    expect(r.rows[1]).toMatchObject({ invoices: 1, total: 115000, oldestLateDays: 120 });
  });

  it("fully paid invoices drop out", async () => {
    const { ctx, client } = await setup();
    const id = await invoiceDue(ctx, client.id, null);
    await addPayment(ctx, id, { amount: 115000, paidOn: todayInRiyadh(), method: "CASH" });
    expect((await receivablesAging(ctx)).rows).toHaveLength(0);
  });
});

describe("reports: monthly trend", () => {
  beforeEach(resetDb);

  it("sums income (invoice payments + manual) and expenses per month without VAT, skipping voided", async () => {
    const { ctx, client } = await setup();
    const today = todayInRiyadh();
    const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 3));
    const inv = await invoiceDue(ctx, client.id, null);
    await addPayment(ctx, inv, { amount: 115000, paidOn: thisMonth, method: "BANK_TRANSFER" }); // 1,000 net
    await createEntry(ctx, { kind: "EXPENSE", categoryId: await category(ctx, "EXPENSE"), amount: 40000, date: thisMonth, includesVat: false, method: "CASH", siteId: null, description: null, reference: null });
    await createEntry(ctx, { kind: "INCOME", categoryId: await category(ctx, "INCOME"), amount: 20000, date: lastMonth, includesVat: false, method: "CASH", siteId: null, description: null, reference: null });

    const mistake = await createEntry(ctx, { kind: "EXPENSE", categoryId: await category(ctx, "EXPENSE"), amount: 99900, date: thisMonth, includesVat: false, method: "CASH", siteId: null, description: null, reference: null });
    await voidEntry(ctx, mistake.id, "typo");

    const r = await monthlyTrend(ctx, 12);
    expect(r.rows).toHaveLength(12);
    expect(r.rows[11]).toMatchObject({ income: 100000, expense: 40000, profit: 60000 });
    expect(r.rows[10]).toMatchObject({ income: 20000, expense: 0, profit: 20000 });
    expect(r.totals).toEqual({ income: 120000, expense: 40000, profit: 80000 });
  });
});

describe("dashboard", () => {
  beforeEach(resetDb);

  it("counts pending sales work, receivables, unpaid salaries and this month's result", async () => {
    const { ctx, client, site } = await setup();
    const today = todayInRiyadh();
    // Pending: one draft invoice, one sent quotation, one sent proforma (+ one converted, not pending).
    await createSalesDoc(ctx, "INVOICE", docInput(client.id, site.id));
    const q = await createSalesDoc(ctx, "QUOTATION", docInput(client.id, site.id));
    await markSalesDocSent(ctx, q.id);
    const p = await createSalesDoc(ctx, "PROFORMA", docInput(client.id, site.id));
    await markSalesDocSent(ctx, p.id);
    const p2 = await createSalesDoc(ctx, "PROFORMA", docInput(client.id, site.id));
    await markSalesDocSent(ctx, p2.id);
    await convertSalesDoc(ctx, p2.id, "INVOICE"); // makes a second draft invoice

    const pending = await pendingSalesWork(ctx);
    expect(pending).toEqual({
      draftInvoices: { count: 2, total: 230000 },
      openProformas: { count: 1, total: 115000 },
      openQuotations: { count: 1, total: 115000 },
    });

    // Receivables: one invoice partly paid this month, later overdue.
    const inv = await invoiceDue(ctx, client.id, today);
    await addPayment(ctx, inv, { amount: 57500, paidOn: today, method: "CASH" });

    // Salaries: approve a sheet for 2 workers and pay one.
    await createWorker(ctx, workerInput("Rahim", "2100000001", { siteId: site.id, basicSalary: 150000, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0 }));
    await createWorker(ctx, workerInput("Karim", "2100000002", { siteId: site.id, basicSalary: 100000, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0 }));
    const sheetId = await createSheetForActiveWorkers(ctx, { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1, siteId: null });
    await approveSheet(ctx, sheetId, today);
    const sheet = await getSheet(ctx, sheetId);
    await markPaid(ctx, sheetId, today, sheet.lines.find((l) => l.workerName === "Karim")!.id);

    const data = await dashboardData(ctx);
    expect(data.receivables).toEqual({ outstanding: 57500, unpaidCount: 1, overdueAmount: 0, overdueCount: 0 });
    expect(data.salaries).toEqual({ amount: 150000, sheets: 1 });
    expect(data.sites).toEqual({ sites: 1, workers: 2 });
    // Income 500 net (half of the invoice), expense = approved salaries 2,500.
    expect(data.month).toMatchObject({ income: 50000, expense: 250000, profit: -200000 });
    expect(data.pending.draftInvoices.count).toBe(2);

    const later = await dashboardData(ctx, new Date(Date.now() + 5 * DAY));
    expect(later.receivables).toMatchObject({ overdueAmount: 57500, overdueCount: 1 });

    // "Not fully paid" filter on the salaries list.
    const unpaid = await listSheets(ctx, { q: "", year: null, status: "UNPAID", page: 1 });
    expect(unpaid.items.map((s) => s.id)).toEqual([sheetId]);
    await markPaid(ctx, sheetId, today, null);
    expect((await listSheets(ctx, { q: "", year: null, status: "UNPAID", page: 1 })).total).toBe(0);
    expect((await dashboardData(ctx)).salaries).toEqual({ amount: 0, sheets: 0 });
  });

  it("an accountant sees the same dashboard; another company sees none of it", async () => {
    const { ctx, org, client } = await setup();
    await invoiceDue(ctx, client.id, null);
    await createSalesDoc(ctx, "INVOICE", docInput(client.id, null));
    const accountant = await addMember(org.id, "ACCOUNTANT");
    expect((await dashboardData(accountant.ctx)).receivables.outstanding).toBe(115000);

    const other = await setup("Other");
    const data = await dashboardData(other.ctx);
    expect(data.receivables).toEqual({ outstanding: 0, unpaidCount: 0, overdueAmount: 0, overdueCount: 0 });
    expect(data.pending.draftInvoices).toEqual({ count: 0, total: 0 });
    expect((await receivablesAging(other.ctx)).rows).toHaveLength(0);
    expect((await monthlyTrend(other.ctx)).totals).toEqual({ income: 0, expense: 0, profit: 0 });
  });
});
