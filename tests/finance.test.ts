import { beforeEach, describe, expect, it } from "vitest";
import { prisma, systemDb, tenantDb, tenantTransaction } from "@/lib/db";
import { AppError, NotFoundError, ReadOnlyError } from "@/lib/errors";
import { updateOrganization } from "@/features/organizations/service";
import type { OrgContext } from "@/features/organizations/context";
import { createSite } from "@/features/sites/service";
import { addPayment, createCreditNote, createSalesDoc, deletePayment, issueInvoice, issueTaxDocument } from "@/features/sales/service";
import type { SalesDocInput } from "@/features/sales/schemas";
import {
  createCategory,
  createEntry,
  ensureFinanceSetup,
  entryFormOptions,
  getEntry,
  invoiceRefundInfo,
  recordInvoiceRefund,
  listCategories,
  listEntries,
  recordSalarySheetExpenses,
  removeSalarySheetExpenses,
  setCategoryArchived,
  updateEntry,
  voidEntry,
  type EntryQuery,
} from "@/features/finance/service";
import { financeSummary, siteProfitReport } from "@/features/finance/report";
import { parsePeriod, presetRange } from "@/features/finance/period";
import { paymentVatShare, vatFromGross } from "@/features/finance/vat";
import type { EntryInput } from "@/features/finance/schemas";
import { addMember, createOwnerWithOrg, orgWithSite, resetDb } from "./helpers";

const DAY = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const allTime = { preset: "all" as const, from: null, to: null };
const query = (extra: Partial<EntryQuery> = {}): EntryQuery => ({ kind: "", categoryId: "", siteId: "", q: "", voided: false, period: allTime, page: 1, ...extra });

describe("finance: VAT and period helpers", () => {
  it("splits VAT out of an amount that includes 15%", () => {
    expect(vatFromGross(11500, 1500)).toBe(1500);
    expect(vatFromGross(100, 1500)).toBe(13); // 13.04 rounds to 13
    expect(vatFromGross(0, 1500)).toBe(0);
    expect(vatFromGross(5000, 0)).toBe(0);
  });

  it("VAT parts of partial payments add up exactly to the invoice VAT", () => {
    const invoice = { total: 100001, vatAmount: 13044 };
    const payments = [33333, 33333, 33335];
    let paid = 0;
    let vat = 0;
    for (const p of payments) {
      vat += paymentVatShare(invoice, paid, p);
      paid += p;
    }
    expect(paid).toBe(invoice.total);
    expect(vat).toBe(invoice.vatAmount);
    expect(paymentVatShare({ total: 1000, vatAmount: 0 }, 0, 1000)).toBe(0);
  });

  it("builds periods from presets and custom ranges", () => {
    const today = d("2026-11-27");
    expect(presetRange("this-month", today)).toMatchObject({ from: d("2026-11-01"), to: d("2026-11-30") });
    expect(presetRange("last-month", d("2026-01-15"))).toMatchObject({ from: d("2025-12-01"), to: d("2025-12-31") });
    expect(presetRange("this-quarter", today)).toMatchObject({ from: d("2026-10-01"), to: d("2026-12-31") });
    expect(presetRange("this-year", today)).toMatchObject({ from: d("2026-01-01"), to: d("2026-12-31") });
    expect(parsePeriod({ from: "30/11/2026", to: "2026-11-01" }, "this-month", today)).toMatchObject({ preset: "custom", from: d("2026-11-01"), to: d("2026-11-30") });
    expect(parsePeriod({ period: "nonsense" }, "this-month", today).preset).toBe("this-month");
  });
});

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
    // 26 × 80 + 3,500 = 5,580 SAR; VAT 837; total 6,417 SAR.
    lines: [
      { description: "Helpers", descriptionAr: null, quantity: 26000, unitPrice: 8000 },
      { description: "Supervisor", descriptionAr: null, quantity: 1000, unitPrice: 350000 },
    ],
    ...extra,
  };
}

async function setup(name = "Alpha") {
  const o = await orgWithSite(name);
  await updateOrganization(o.ctx, { nameAr: null, vatNumber: "300000000000003", crNumber: "1010101010" });
  return o;
}

async function issuedInvoice(ctx: OrgContext, clientId: string, siteId: string | null) {
  const draft = await createSalesDoc(ctx, "INVOICE", docInput(clientId, siteId));
  await issueInvoice(ctx, draft.id);
  return tenantDb(ctx.organizationId).salesDocument.findUniqueOrThrow({ where: { id: draft.id } });
}

async function categoryId(ctx: OrgContext, kind: "INCOME" | "EXPENSE", systemKey: string) {
  const all = await listCategories(ctx);
  const c = all.find((x) => x.kind === kind && x.systemKey === systemKey);
  if (!c) throw new Error(`missing ${systemKey}`);
  return c.id;
}

function entry(kind: "INCOME" | "EXPENSE", categoryId: string, amount: number, extra: Partial<EntryInput> = {}): EntryInput {
  return { kind, categoryId, amount, date: d("2026-11-10"), includesVat: false, method: "CASH", siteId: null, description: null, reference: null, ...extra };
}

describe("finance: invoice payments become income", () => {
  beforeEach(resetDb);

  it("each payment creates income for the invoice's client and site, with its VAT part", async () => {
    const { ctx, client, site } = await setup();
    const inv = await issuedInvoice(ctx, client.id, site.id);
    expect(inv.total).toBe(641700);
    const p1 = await addPayment(ctx, inv.id, { amount: 300000, paidOn: d("2026-11-15"), method: "BANK_TRANSFER", reference: "TRX-1" });
    await addPayment(ctx, inv.id, { amount: 341700, paidOn: d("2026-11-20"), method: "CASH" });

    const list = await listEntries(ctx, query());
    expect(list.total).toBe(2);
    const first = list.items.find((e) => e.salesPaymentId === p1.id)!;
    expect(first).toMatchObject({ kind: "INCOME", source: "INVOICE_PAYMENT", amount: 300000, siteId: site.id, clientId: client.id, description: inv.number, reference: "TRX-1" });
    expect(first.date).toEqual(d("2026-11-15"));
    // VAT parts add up to the invoice VAT once fully paid.
    expect(list.totals.income).toBe(641700);
    expect(list.totals.incomeVat).toBe(83700);
  });

  it("removing a payment removes its income", async () => {
    const { ctx, client, site } = await setup();
    const inv = await issuedInvoice(ctx, client.id, site.id);
    const p = await addPayment(ctx, inv.id, { amount: 1000, paidOn: d("2026-11-15"), method: "CASH" });
    expect((await listEntries(ctx, query())).total).toBe(1);
    await deletePayment(ctx, p.id);
    expect((await listEntries(ctx, query())).total).toBe(0);
  });

  it("automatic income cannot be edited or voided on the finance pages", async () => {
    const { ctx, client, site } = await setup();
    const inv = await issuedInvoice(ctx, client.id, site.id);
    await addPayment(ctx, inv.id, { amount: 1000, paidOn: d("2026-11-15"), method: "CASH" });
    const auto = (await listEntries(ctx, query())).items[0]!;
    await expect(voidEntry(ctx, auto.id, null)).rejects.toMatchObject({ code: "entryAutomatic" });
    const other = await categoryId(ctx, "INCOME", "other_income");
    await expect(updateEntry(ctx, auto.id, entry("INCOME", other, 5))).rejects.toMatchObject({ code: "entryAutomatic" });
  });

  it("backfills income for payments recorded before the finance module", async () => {
    const { ctx, client, site } = await setup();
    const inv = await issuedInvoice(ctx, client.id, site.id);
    await addPayment(ctx, inv.id, { amount: 200000, paidOn: d("2026-11-01"), method: "CASH" });
    await addPayment(ctx, inv.id, { amount: 441700, paidOn: d("2026-11-02"), method: "CASH" });
    await systemDb().financeEntry.deleteMany({ where: { organizationId: ctx.organizationId } });
    await ensureFinanceSetup(ctx);
    await ensureFinanceSetup(ctx); // idempotent
    const list = await listEntries(ctx, query());
    expect(list.total).toBe(2);
    expect(list.totals).toMatchObject({ income: 641700, incomeVat: 83700 });
  });
});

describe("finance: refunds after a credit note", () => {
  beforeEach(resetDb);

  async function paidAndCredited() {
    const o = await setup();
    const inv = await issuedInvoice(o.ctx, o.client.id, o.site.id);
    const pay = await addPayment(o.ctx, inv.id, { amount: inv.total, paidOn: d("2026-11-15"), method: "BANK_TRANSFER" });
    // Credit 1,000 SAR + 150 VAT on a fully paid invoice: the client is owed 1,150.
    const cn = await createCreditNote(
      o.ctx,
      inv.id,
      docInput(o.client.id, o.site.id, { reason: "Two days not worked", lines: [{ description: "Helpers", descriptionAr: null, quantity: 1000, unitPrice: 100000 }] }),
    );
    await issueTaxDocument(o.ctx, cn.id);
    return { ...o, inv, pay };
  }

  it("a refund is negative income with its VAT part, limited to what is owed", async () => {
    const { ctx, inv, site } = await paidAndCredited();
    expect((await invoiceRefundInfo(ctx, inv.id))?.due).toBe(115000);
    await expect(recordInvoiceRefund(ctx, inv.id, { amount: 115001, date: null, method: "CASH", reference: null })).rejects.toMatchObject({ field: "amount" });
    const r = await recordInvoiceRefund(ctx, inv.id, { amount: 115000, date: d("2026-11-20"), method: "BANK_TRANSFER", reference: "RF-1" });
    expect(r).toMatchObject({ kind: "INCOME", source: "INVOICE_REFUND", amount: -115000, vatAmount: -15000, siteId: site.id });
    expect(await invoiceRefundInfo(ctx, inv.id)).toMatchObject({ due: 0, refunded: 115000 });
    await expect(recordInvoiceRefund(ctx, inv.id, { amount: 1, date: null, method: "CASH", reference: null })).rejects.toMatchObject({ field: "amount" });

    const s = await financeSummary(ctx, allTime);
    expect(s.incomeNet).toBe(558000 - 100000);
    expect(s.vat.collected).toBe(83700 - 15000);
    expect((await siteProfitReport(ctx, allTime)).rows[0]).toMatchObject({ income: 458000 });

    // Voiding a refund makes the amount due again.
    await voidEntry(ctx, r.id, "Wrong amount");
    expect((await invoiceRefundInfo(ctx, inv.id))?.due).toBe(115000);
  });

  it("parallel refunds can never pay back more than is owed", async () => {
    const { ctx, inv } = await paidAndCredited();
    const one = () => recordInvoiceRefund(ctx, inv.id, { amount: 100000, date: null, method: "CASH", reference: null });
    const results = await Promise.allSettled([one(), one()]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("a payment cannot be removed while its refund depends on it", async () => {
    const { ctx, inv, pay } = await paidAndCredited();
    await recordInvoiceRefund(ctx, inv.id, { amount: 115000, date: null, method: "CASH", reference: null });
    await expect(deletePayment(ctx, pay.id)).rejects.toMatchObject({ code: "paymentHasRefund" });
  });

  it("nothing is owed on an invoice that is not overpaid", async () => {
    const { ctx, client, site } = await setup();
    const inv = await issuedInvoice(ctx, client.id, site.id);
    expect((await invoiceRefundInfo(ctx, inv.id))?.due).toBe(0);
    await expect(recordInvoiceRefund(ctx, inv.id, { amount: 1, date: null, method: "CASH", reference: null })).rejects.toMatchObject({ field: "amount" });
  });
});

describe("finance: manual entries", () => {
  beforeEach(resetDb);

  it("creates income and expenses with optional VAT; derives the client from the site", async () => {
    const { ctx, client, site } = await setup();
    const rent = await categoryId(ctx, "EXPENSE", "accommodation");
    const e = await createEntry(ctx, entry("EXPENSE", rent, 115000, { includesVat: true, siteId: site.id, description: "Camp rent" }));
    expect(e).toMatchObject({ amount: 115000, vatAmount: 15000, siteId: site.id, clientId: client.id, source: "MANUAL" });
    const audit = await tenantDb(ctx.organizationId).auditLog.findFirst({ where: { action: "finance.expense_created", entityId: e.id } });
    expect(audit?.metadata).toMatchObject({ amount: 115000, vat: 15000 });
  });

  it("refuses a category of the other kind, the invoice-payments category, or an archived one", async () => {
    const { ctx } = await setup();
    const salaries = await categoryId(ctx, "EXPENSE", "salaries");
    const invoicePayments = await categoryId(ctx, "INCOME", "invoice_payments");
    await expect(createEntry(ctx, entry("INCOME", salaries, 100))).rejects.toMatchObject({ field: "categoryId" });
    await expect(createEntry(ctx, entry("INCOME", invoicePayments, 100))).rejects.toMatchObject({ field: "categoryId" });
    const custom = await createCategory(ctx, { kind: "EXPENSE", nameEn: "Bribes", nameAr: null });
    await setCategoryArchived(ctx, custom.id, true);
    await expect(createEntry(ctx, entry("EXPENSE", custom.id, 100))).rejects.toMatchObject({ field: "categoryId" });
    const options = await entryFormOptions(ctx);
    expect(options.categories.some((c) => c.id === invoicePayments || c.id === custom.id)).toBe(false);
  });

  it("edits keep an audit trail; voided entries leave the totals", async () => {
    const { ctx } = await setup();
    const fuel = await categoryId(ctx, "EXPENSE", "transport");
    const e = await createEntry(ctx, entry("EXPENSE", fuel, 5000));
    await updateEntry(ctx, e.id, entry("EXPENSE", fuel, 7000));
    const audit = await tenantDb(ctx.organizationId).auditLog.findFirst({ where: { action: "finance.entry_updated", entityId: e.id } });
    expect(audit?.metadata).toMatchObject({ from: { amount: 5000 }, to: { amount: 7000 } });
    expect((await listEntries(ctx, query())).totals.expense).toBe(7000);

    await voidEntry(ctx, e.id, "Entered twice");
    expect((await listEntries(ctx, query())).total).toBe(0);
    expect((await listEntries(ctx, query())).totals.expense).toBe(0);
    const voided = await listEntries(ctx, query({ voided: true }));
    expect(voided.items[0]).toMatchObject({ id: e.id, voidReason: "Entered twice" });
    await expect(updateEntry(ctx, e.id, entry("EXPENSE", fuel, 1))).rejects.toMatchObject({ code: "entryVoided" });
  });

  it("filters by kind, category, site, period and text", async () => {
    const { ctx, client, site } = await setup();
    const site2 = await createSite(ctx, { clientId: client.id, name: "North Camp", city: null, address: null, notes: null });
    const food = await categoryId(ctx, "EXPENSE", "food");
    const other = await categoryId(ctx, "INCOME", "other_income");
    await createEntry(ctx, entry("EXPENSE", food, 1000, { siteId: site.id, date: d("2026-10-31") }));
    await createEntry(ctx, entry("EXPENSE", food, 2000, { siteId: site2.id, description: "Ramadan iftar" }));
    await createEntry(ctx, entry("INCOME", other, 3000));
    expect((await listEntries(ctx, query({ kind: "EXPENSE" }))).total).toBe(2);
    expect((await listEntries(ctx, query({ siteId: site2.id }))).total).toBe(1);
    expect((await listEntries(ctx, query({ siteId: "none" }))).total).toBe(1);
    expect((await listEntries(ctx, query({ q: "iftar" }))).total).toBe(1);
    expect((await listEntries(ctx, query({ q: "north" }))).total).toBe(1);
    const nov = presetRange("this-month", d("2026-11-27"));
    const novList = await listEntries(ctx, query({ period: nov }));
    expect(novList.total).toBe(2);
    expect(novList.totals).toMatchObject({ income: 3000, expense: 2000 });
  });
});

describe("finance: categories", () => {
  beforeEach(resetDb);

  it("every company gets the default list once; system categories cannot be archived", async () => {
    const { ctx } = await setup();
    const first = await listCategories(ctx);
    expect(first.length).toBe(12);
    expect((await listCategories(ctx)).length).toBe(12);
    const salaries = first.find((c) => c.systemKey === "salaries")!;
    expect(salaries.locked).toBe(true);
    await expect(setCategoryArchived(ctx, salaries.id, true)).rejects.toMatchObject({ code: "categoryLocked" });
    const food = first.find((c) => c.systemKey === "food")!;
    await setCategoryArchived(ctx, food.id, true);
    await setCategoryArchived(ctx, food.id, false);
  });

  it("names are unique per kind among active categories", async () => {
    const { ctx } = await setup();
    await createCategory(ctx, { kind: "EXPENSE", nameEn: "Uniforms", nameAr: "الزي" });
    await expect(createCategory(ctx, { kind: "EXPENSE", nameEn: "uniforms", nameAr: null })).rejects.toMatchObject({ field: "nameEn" });
    await createCategory(ctx, { kind: "INCOME", nameEn: "Uniforms", nameAr: null });
  });
});

describe("finance: salary sheet hook (step 5)", () => {
  beforeEach(resetDb);

  it("records one expense per site, replaces on repeat, and can be removed", async () => {
    const { ctx, client, site } = await setup();
    const site2 = await createSite(ctx, { clientId: client.id, name: "North Camp", city: null, address: null, notes: null });
    const record = (lines: { siteId: string | null; amount: number }[]) =>
      tenantTransaction(ctx.organizationId, (tx) =>
        recordSalarySheetExpenses(tx, { organizationId: ctx.organizationId, userId: ctx.userId, salarySheetId: "sheet-1", date: d("2026-11-30"), description: "Salaries November 2026", lines }),
      );
    await record([
      { siteId: site.id, amount: 150000 },
      { siteId: site.id, amount: 50000 },
      { siteId: site2.id, amount: 180000 },
      { siteId: null, amount: 0 },
    ]);
    let list = await listEntries(ctx, query());
    expect(list.total).toBe(2);
    expect(list.totals.expense).toBe(380000);
    expect(list.items.every((e) => e.source === "SALARY_SHEET" && e.clientId === client.id)).toBe(true);

    await record([{ siteId: site.id, amount: 100000 }]);
    list = await listEntries(ctx, query());
    expect(list.total).toBe(1);
    expect(list.totals.expense).toBe(100000);

    await tenantTransaction(ctx.organizationId, (tx) => removeSalarySheetExpenses(tx, ctx.organizationId, "sheet-1", ctx.userId));
    expect((await listEntries(ctx, query())).total).toBe(0);
  });
});

describe("finance: reports", () => {
  beforeEach(resetDb);

  it("summary and site-wise profit are without VAT, cash basis, and skip voided entries", async () => {
    const { ctx, client, site } = await setup();
    const site2 = await createSite(ctx, { clientId: client.id, name: "North Camp", city: null, address: null, notes: null });
    const inv = await issuedInvoice(ctx, client.id, site.id);
    await addPayment(ctx, inv.id, { amount: inv.total, paidOn: d("2026-11-15"), method: "BANK_TRANSFER" });
    const accommodation = await categoryId(ctx, "EXPENSE", "accommodation");
    const rent = await categoryId(ctx, "EXPENSE", "rent");
    await createEntry(ctx, entry("EXPENSE", accommodation, 115000, { includesVat: true, siteId: site.id })); // 1,000 + VAT
    await createEntry(ctx, entry("EXPENSE", accommodation, 50000, { siteId: site2.id }));
    await createEntry(ctx, entry("EXPENSE", rent, 200000)); // overhead
    const wrong = await createEntry(ctx, entry("EXPENSE", rent, 999999));
    await voidEntry(ctx, wrong.id, null);
    await createEntry(ctx, entry("EXPENSE", rent, 70000, { date: d("2026-10-01") })); // other month

    const nov = presetRange("this-month", d("2026-11-27"));
    const s = await financeSummary(ctx, nov);
    expect(s.incomeNet).toBe(558000);
    expect(s.expenseNet).toBe(100000 + 50000 + 200000);
    expect(s.profit).toBe(558000 - 350000);
    expect(s.vat).toEqual({ collected: 83700, paid: 15000, net: 68700 });
    expect(s.expense.map((r) => [r.nameEn, r.net])).toEqual([
      ["Office rent", 200000],
      ["Accommodation", 150000],
    ]);

    const r = await siteProfitReport(ctx, nov);
    expect(r.rows.map((x) => [x.siteName, x.income, x.expense, x.profit])).toEqual([
      ["Main Site", 558000, 100000, 458000],
      ["North Camp", 0, 50000, -50000],
      [null, 0, 200000, -200000],
    ]);
    expect(r.rows[0]!.marginBp).toBe(8208);
    expect(r.totals).toMatchObject({ income: 558000, expense: 350000, profit: 208000 });
  });
});

describe("finance: tenant isolation and permissions", () => {
  beforeEach(resetDb);

  it("services never read or change another company's entries or categories", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    const bFood = await categoryId(b.ctx, "EXPENSE", "food");
    const bEntry = await createEntry(b.ctx, entry("EXPENSE", bFood, 1000, { siteId: b.site.id }));
    await expect(getEntry(a.ctx, bEntry.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(voidEntry(a.ctx, bEntry.id, null)).rejects.toBeInstanceOf(NotFoundError);
    const aFood = await categoryId(a.ctx, "EXPENSE", "food");
    await expect(updateEntry(a.ctx, bEntry.id, entry("EXPENSE", aFood, 1))).rejects.toBeInstanceOf(NotFoundError);
    // Another company's category or site cannot be used.
    await expect(createEntry(a.ctx, entry("EXPENSE", bFood, 1000))).rejects.toMatchObject({ field: "categoryId" });
    await expect(createEntry(a.ctx, entry("EXPENSE", aFood, 1000, { siteId: b.site.id }))).rejects.toMatchObject({ field: "siteId" });
    await expect(setCategoryArchived(a.ctx, bFood, true)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listEntries(a.ctx, query())).total).toBe(0);
    expect((await financeSummary(a.ctx, allTime)).expenseNet).toBe(0);
    expect((await siteProfitReport(a.ctx, allTime)).rows).toEqual([]);
  });

  it("the database refuses an entry pointing at another company's category, site or payment", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    const aFood = await categoryId(a.ctx, "EXPENSE", "food");
    const bFood = await categoryId(b.ctx, "EXPENSE", "food");
    const base = { organizationId: a.org.id, kind: "EXPENSE" as const, date: new Date(), amount: 1 };
    await expect(systemDb().financeEntry.create({ data: { ...base, categoryId: bFood } })).rejects.toThrow();
    await expect(systemDb().financeEntry.create({ data: { ...base, categoryId: aFood, siteId: b.site.id } })).rejects.toThrow();
    const inv = await issuedInvoice(b.ctx, b.client.id, null);
    const pay = await addPayment(b.ctx, inv.id, { amount: 100, paidOn: new Date(), method: "CASH" });
    const aOther = await categoryId(a.ctx, "INCOME", "other_income");
    await expect(
      systemDb().financeEntry.create({ data: { ...base, kind: "INCOME", source: "INVOICE_PAYMENT", categoryId: aOther, salesPaymentId: pay.id } }),
    ).rejects.toThrow();
    // RLS: writing into another company is refused, and with no tenant set nothing is visible.
    await expect(tenantDb(a.org.id).financeEntry.create({ data: { ...base, organizationId: b.org.id, categoryId: bFood } })).rejects.toThrow();
    expect(await prisma.financeEntry.count()).toBe(0);
  });

  it("the database refuses negative amounts, VAT above the amount and mismatched sources", async () => {
    const a = await setup();
    const food = await categoryId(a.ctx, "EXPENSE", "food");
    const base = { organizationId: a.org.id, kind: "EXPENSE" as const, date: new Date(), categoryId: food };
    await expect(systemDb().financeEntry.create({ data: { ...base, amount: -5 } })).rejects.toThrow();
    await expect(systemDb().financeEntry.create({ data: { ...base, amount: 5, vatAmount: 6 } })).rejects.toThrow();
    await expect(systemDb().financeEntry.create({ data: { ...base, amount: 5, source: "SALARY_SHEET" } })).rejects.toThrow();
  });

  it("accountants can record entries; read-only companies can only view", async () => {
    const a = await setup();
    const acc = await addMember(a.org.id, "ACCOUNTANT");
    const food = await categoryId(acc.ctx, "EXPENSE", "food");
    await createEntry(acc.ctx, entry("EXPENSE", food, 1000));
    const { ctx: expiredCtx } = await createOwnerWithOrg("Expired", new Date(Date.now() - 30 * DAY));
    const readOnly: OrgContext = { ...a.ctx, access: expiredCtx.access };
    expect(readOnly.access.readOnly).toBe(true);
    await expect(createEntry(readOnly, entry("EXPENSE", food, 1000))).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(createCategory(readOnly, { kind: "EXPENSE", nameEn: "X", nameAr: null })).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await listEntries(readOnly, query())).total).toBe(1);
    expect((await financeSummary(readOnly, allTime)).expenseNet).toBe(1000);
    await expect(ensureFinanceSetup(readOnly)).resolves.toBeUndefined();
    expect(AppError).toBeDefined();
  });
});
