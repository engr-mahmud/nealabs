import type { Prisma } from "@/generated/prisma/client";
import type { FinanceKind } from "@/generated/prisma/enums";
import { financeConfig } from "@/config/finance";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { AppError, FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { dateFilter, type Period } from "./period";
import type { CategoryInput, EntryInput } from "./schemas";
import { mulDivRound } from "@/features/sales/totals";
import type { RefundInput } from "./schemas";
import { paymentVatShare, vatFromGross } from "./vat";

const LOCKED_KEYS: readonly string[] = Object.values(financeConfig.systemKeys);

/** Categories the user may pick for a manual entry (invoice payments come only from invoices). */
const isManualCategory = (c: { systemKey: string | null }) => c.systemKey !== financeConfig.systemKeys.invoicePayments;

// ---------------------------------------------------------------- categories

/** Creates the default categories a company is missing (idempotent, cheap when they exist). */
export async function ensureDefaultCategories(tx: TxClient, organizationId: string) {
  const defaults = financeConfig.defaultCategories;
  const expected = defaults.INCOME.length + defaults.EXPENSE.length;
  const existing = await tx.financeCategory.count({ where: { systemKey: { not: null } } });
  if (existing >= expected) return;
  await tx.financeCategory.createMany({
    data: (["INCOME", "EXPENSE"] as const).flatMap((kind) =>
      defaults[kind].map((c) => ({ organizationId, kind, systemKey: c.key, nameEn: c.nameEn, nameAr: c.nameAr })),
    ),
    skipDuplicates: true,
  });
}

async function systemCategoryId(tx: TxClient, organizationId: string, kind: FinanceKind, key: string) {
  await ensureDefaultCategories(tx, organizationId);
  const category = await tx.financeCategory.findFirst({ where: { kind, systemKey: key }, select: { id: true } });
  if (!category) throw new Error(`Finance category ${key} missing`);
  return category.id;
}

export async function listCategories(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    if (!ctx.access.readOnly) await ensureDefaultCategories(tx, ctx.organizationId);
    const items = await tx.financeCategory.findMany({
      orderBy: [{ kind: "asc" }, { archivedAt: { sort: "desc", nulls: "first" } }, { createdAt: "asc" }],
      include: { _count: { select: { entries: { where: { voidedAt: null } } } } },
    });
    return items.map((c) => ({ ...c, locked: !!c.systemKey && LOCKED_KEYS.includes(c.systemKey) }));
  });
}

async function assertCategoryNameFree(tx: TxClient, kind: FinanceKind, nameEn: string, exceptId?: string) {
  const existing = await tx.financeCategory.findFirst({
    where: { kind, nameEn: { equals: nameEn, mode: "insensitive" }, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new FieldError("nameEn", "categoryExists");
}

export async function createCategory(ctx: OrgContext, input: CategoryInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    await ensureDefaultCategories(tx, ctx.organizationId);
    await assertCategoryNameFree(tx, input.kind, input.nameEn);
    const category = await tx.financeCategory.create({
      data: { organizationId: ctx.organizationId, kind: input.kind, nameEn: input.nameEn, nameAr: input.nameAr ?? null },
    });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "finance.category_created", entityType: "FinanceCategory", entityId: category.id, metadata: { kind: input.kind, name: input.nameEn } });
    return category;
  });
}

/** Renames a category. The kind never changes (entries would move between income and expense). */
export async function updateCategory(ctx: OrgContext, id: string, input: Pick<CategoryInput, "nameEn" | "nameAr">) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const category = await tx.financeCategory.findFirst({ where: { id } });
    if (!category) throw new NotFoundError();
    await assertCategoryNameFree(tx, category.kind, input.nameEn, id);
    const updated = await tx.financeCategory.update({ where: { id }, data: { nameEn: input.nameEn, nameAr: input.nameAr ?? null } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "finance.category_updated", entityType: "FinanceCategory", entityId: id, metadata: { from: category.nameEn, to: input.nameEn } });
    return updated;
  });
}

/** Archived categories keep their entries and reports; they are only hidden from the entry form. */
export async function setCategoryArchived(ctx: OrgContext, id: string, archived: boolean) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const category = await tx.financeCategory.findFirst({ where: { id } });
    if (!category) throw new NotFoundError();
    if (archived && category.systemKey && LOCKED_KEYS.includes(category.systemKey)) throw new AppError("categoryLocked");
    if (!archived) await assertCategoryNameFree(tx, category.kind, category.nameEn, id);
    await tx.financeCategory.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: archived ? "finance.category_archived" : "finance.category_restored", entityType: "FinanceCategory", entityId: id });
  });
}

// ---------------------------------------------------------------- automatic entries

export interface InvoicePaymentForIncome {
  organizationId: string;
  userId: string | null;
  payment: { id: string; amount: number; paidOn: Date; method: Prisma.FinanceEntryCreateManyInput["method"]; reference: string | null };
  invoice: { number: string | null; total: number; vatAmount: number; clientId: string; siteId: string | null };
  /** Amount already paid on the invoice before this payment (for the VAT split). */
  paidBefore: number;
}

/**
 * Called inside the payment transaction: every invoice payment is income on the day it
 * was received, for the invoice's client and site. Removing the payment removes this
 * entry with it (foreign key ON DELETE CASCADE).
 */
export async function recordInvoicePaymentIncome(tx: TxClient, p: InvoicePaymentForIncome) {
  const categoryId = await systemCategoryId(tx, p.organizationId, "INCOME", financeConfig.systemKeys.invoicePayments);
  return tx.financeEntry.create({
    data: {
      organizationId: p.organizationId,
      kind: "INCOME",
      source: "INVOICE_PAYMENT",
      categoryId,
      date: p.payment.paidOn,
      amount: p.payment.amount,
      vatAmount: paymentVatShare(p.invoice, p.paidBefore, p.payment.amount),
      description: p.invoice.number,
      reference: p.payment.reference,
      method: p.payment.method,
      clientId: p.invoice.clientId,
      siteId: p.invoice.siteId,
      salesPaymentId: p.payment.id,
      createdById: p.userId,
    },
  });
}

/**
 * Creates income for invoice payments that have none (payments made before the finance
 * module existed). Payments are replayed per invoice in order, so the VAT split matches.
 */
async function backfillInvoicePaymentIncome(tx: TxClient, organizationId: string) {
  const missing = await tx.salesPayment.findMany({ where: { financeEntry: null }, select: { documentId: true } });
  if (missing.length === 0) return 0;
  const docIds = [...new Set(missing.map((m) => m.documentId))];
  const docs = await tx.salesDocument.findMany({
    where: { id: { in: docIds } },
    select: { number: true, total: true, vatAmount: true, clientId: true, siteId: true, payments: { orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }], include: { financeEntry: { select: { id: true } } } } },
  });
  let created = 0;
  for (const doc of docs) {
    let paidBefore = 0;
    for (const payment of doc.payments) {
      if (!payment.financeEntry) {
        await recordInvoicePaymentIncome(tx, { organizationId, userId: payment.createdById, payment, invoice: doc, paidBefore });
        created += 1;
      }
      paidBefore += payment.amount;
    }
  }
  return created;
}

// ---------------------------------------------------------------- refunds on credited invoices

/**
 * Money the company owes back on an invoice: what was paid plus what was credited, beyond
 * the invoice total, minus refunds already recorded. Example: paid 1,150 in full, then a
 * credit note of 230 → 230 to pay back to the client.
 */
export function refundDue(invoice: { total: number; paidAmount: number; creditedAmount: number }, refunded: number): number {
  return Math.max(0, invoice.paidAmount + invoice.creditedAmount - invoice.total) - refunded;
}

/** Sum of active (not voided) refunds on an invoice, as a positive number. */
async function refundedOn(tx: TxClient, invoiceId: string) {
  const agg = await tx.financeEntry.aggregate({ where: { source: "INVOICE_REFUND", salesDocumentId: invoiceId, voidedAt: null }, _sum: { amount: true } });
  return -(agg._sum.amount ?? 0);
}

/** Refund status of one invoice, for the invoice page. */
export async function invoiceRefundInfo(ctx: OrgContext, invoiceId: string) {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const invoice = await tx.salesDocument.findFirst({ where: { id: invoiceId, type: "INVOICE" }, select: { total: true, paidAmount: true, creditedAmount: true } });
    if (!invoice) return null;
    const refunds = await tx.financeEntry.findMany({
      where: { source: "INVOICE_REFUND", salesDocumentId: invoiceId, voidedAt: null },
      orderBy: { date: "asc" },
      select: { id: true, date: true, amount: true, method: true, reference: true },
    });
    const refunded = -refunds.reduce((sum, r) => sum + r.amount, 0);
    return { due: refundDue(invoice, refunded), refunded, refunds };
  });
}

/**
 * Records money paid back to a client after a credit note on a paid invoice. It is
 * negative income (category "Invoice payments") for the invoice's client and site, with
 * the invoice's VAT share, so reports show what was really earned.
 */
export async function recordInvoiceRefund(ctx: OrgContext, invoiceId: string, input: RefundInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    // Lock the invoice row so parallel refunds cannot both pass the check.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "sales_documents" WHERE "id" = ${invoiceId} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundError();
    const invoice = await tx.salesDocument.findFirst({
      where: { id: invoiceId },
      select: { type: true, status: true, number: true, total: true, vatAmount: true, paidAmount: true, creditedAmount: true, clientId: true, siteId: true },
    });
    if (!invoice) throw new NotFoundError();
    if (invoice.type !== "INVOICE" || invoice.status !== "SENT") throw new AppError("notFound");
    const due = refundDue(invoice, await refundedOn(tx, invoiceId));
    if (input.amount > due) throw new FieldError("amount", "refundTooLarge");
    const categoryId = await systemCategoryId(tx, ctx.organizationId, "INCOME", financeConfig.systemKeys.invoicePayments);
    const vat = invoice.total > 0 ? mulDivRound(input.amount, invoice.vatAmount, invoice.total) : 0;
    const entry = await tx.financeEntry.create({
      data: {
        organizationId: ctx.organizationId,
        kind: "INCOME",
        source: "INVOICE_REFUND",
        categoryId,
        date: input.date ?? todayInRiyadh(),
        amount: -input.amount,
        vatAmount: -vat,
        description: invoice.number,
        reference: input.reference ?? null,
        method: input.method,
        clientId: invoice.clientId,
        siteId: invoice.siteId,
        salesDocumentId: invoiceId,
        createdById: ctx.userId,
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "finance.refund_recorded",
      entityType: "FinanceEntry",
      entityId: entry.id,
      metadata: { invoice: invoice.number, amount: input.amount, vat },
    });
    return entry;
  });
}

/**
 * Called by deletePayment after the invoice is updated: a payment cannot be removed while
 * refunds already paid back would then be more than the client was owed.
 */
export async function assertRefundsCovered(tx: TxClient, invoiceId: string) {
  const invoice = await tx.salesDocument.findFirst({ where: { id: invoiceId }, select: { total: true, paidAmount: true, creditedAmount: true } });
  if (invoice && refundDue(invoice, await refundedOn(tx, invoiceId)) < 0) throw new AppError("paymentHasRefund");
}

export interface SalarySheetExpenseInput {
  organizationId: string;
  userId: string | null;
  salarySheetId: string;
  /** The day the salaries count as paid (usually the approval or pay date). */
  date: Date;
  /** e.g. "Salaries November 2026". */
  description: string;
  /** Net amounts per site (null = workers without a site). Lines with 0 are skipped. */
  lines: { siteId: string | null; amount: number }[];
}

/**
 * Hook for step 5: an approved salary sheet becomes one expense per site (category
 * "Salaries"), so the site-wise profit report includes labour cost. Calling it again for
 * the same sheet replaces its entries (idempotent). Salaries carry no VAT.
 */
export async function recordSalarySheetExpenses(tx: TxClient, input: SalarySheetExpenseInput) {
  const categoryId = await systemCategoryId(tx, input.organizationId, "EXPENSE", financeConfig.systemKeys.salaries);
  await tx.financeEntry.deleteMany({ where: { source: "SALARY_SHEET", salarySheetId: input.salarySheetId } });
  const bySite = new Map<string | null, number>();
  for (const line of input.lines) {
    if (!Number.isSafeInteger(line.amount) || line.amount < 0) throw new Error("Salary amount must be a non-negative integer (halalas)");
    bySite.set(line.siteId, (bySite.get(line.siteId) ?? 0) + line.amount);
  }
  const siteIds = [...bySite.keys()].filter((s): s is string => !!s);
  const sites = await tx.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, clientId: true } });
  const clientOf = new Map(sites.map((s) => [s.id, s.clientId]));
  const data = [...bySite]
    .filter(([, amount]) => amount > 0)
    .map(([siteId, amount]) => ({
      organizationId: input.organizationId,
      kind: "EXPENSE" as const,
      source: "SALARY_SHEET" as const,
      categoryId,
      date: input.date,
      amount,
      vatAmount: 0,
      description: input.description,
      siteId,
      clientId: siteId ? (clientOf.get(siteId) ?? null) : null,
      salarySheetId: input.salarySheetId,
      createdById: input.userId,
    }));
  if (data.length) await tx.financeEntry.createMany({ data });
  await writeAudit(tx, {
    organizationId: input.organizationId,
    userId: input.userId,
    action: "finance.salary_expense_recorded",
    entityType: "SalarySheet",
    entityId: input.salarySheetId,
    metadata: { total: data.reduce((s, d) => s + d.amount, 0), sites: data.length },
  });
  return data.length;
}

/** Hook for step 5: removes a salary sheet's expenses (for example when it is reopened). */
export async function removeSalarySheetExpenses(tx: TxClient, organizationId: string, salarySheetId: string, userId: string | null) {
  const { count } = await tx.financeEntry.deleteMany({ where: { source: "SALARY_SHEET", salarySheetId } });
  if (count) await writeAudit(tx, { organizationId, userId, action: "finance.salary_expense_removed", entityType: "SalarySheet", entityId: salarySheetId, metadata: { entries: count } });
  return count;
}

/** Run before showing finance pages: default categories plus income for older payments. */
export async function ensureFinanceSetup(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  if (ctx.access.readOnly) {
    // Read-only companies get no new rows; pages still show what exists.
    return;
  }
  await tenantTransaction(ctx.organizationId, async (tx) => {
    await ensureDefaultCategories(tx, ctx.organizationId);
    await backfillInvoicePaymentIncome(tx, ctx.organizationId);
  });
}

// ---------------------------------------------------------------- manual entries

export interface EntryQuery {
  kind: FinanceKind | "";
  categoryId: string;
  siteId: string;
  q: string;
  voided: boolean;
  period: Period;
  page: number;
}

/** "none" as siteId means entries without a site (company overhead). */
function entryWhere(query: Omit<EntryQuery, "page" | "voided">): Prisma.FinanceEntryWhereInput {
  const date = dateFilter(query.period);
  return {
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.siteId === "none" ? { siteId: null } : query.siteId ? { siteId: query.siteId } : {}),
    ...(date ? { date } : {}),
    ...(query.q
      ? {
          OR: [
            { description: { contains: query.q, mode: "insensitive" } },
            { reference: { contains: query.q, mode: "insensitive" } },
            { client: { nameEn: { contains: query.q, mode: "insensitive" } } },
            { site: { name: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export interface KindTotals {
  income: number;
  incomeVat: number;
  expense: number;
  expenseVat: number;
}

export function sumByKind(groups: { kind: FinanceKind; _sum: { amount: number | null; vatAmount: number | null } }[]): KindTotals {
  const t: KindTotals = { income: 0, incomeVat: 0, expense: 0, expenseVat: 0 };
  for (const g of groups) {
    if (g.kind === "INCOME") {
      t.income += g._sum.amount ?? 0;
      t.incomeVat += g._sum.vatAmount ?? 0;
    } else {
      t.expense += g._sum.amount ?? 0;
      t.expenseVat += g._sum.vatAmount ?? 0;
    }
  }
  return t;
}

const entryInclude = {
  category: { select: { id: true, nameEn: true, nameAr: true } },
  site: { select: { id: true, name: true } },
  client: { select: { id: true, nameEn: true, nameAr: true } },
  salesPayment: { select: { documentId: true } },
} satisfies Prisma.FinanceEntryInclude;

export async function listEntries(ctx: OrgContext, query: EntryQuery) {
  assertCan(ctx, "data.read");
  const base = entryWhere(query);
  const where: Prisma.FinanceEntryWhereInput = { ...base, voidedAt: query.voided ? { not: null } : null };
  const take = financeConfig.pageSize;
  const db = tenantDb(ctx.organizationId);
  const [items, total, groups] = await Promise.all([
    db.financeEntry.findMany({ where, include: entryInclude, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take, skip: (query.page - 1) * take }),
    db.financeEntry.count({ where }),
    // Totals never include voided entries.
    db.financeEntry.groupBy({ by: ["kind"], where: { ...base, voidedAt: null }, _sum: { amount: true, vatAmount: true } }),
  ]);
  return { items, total, page: query.page, pageCount: Math.max(1, Math.ceil(total / take)), totals: sumByKind(groups) };
}

/** Rows for the Excel export: same filters as the list, without paging (capped). */
export async function exportEntries(ctx: OrgContext, query: Omit<EntryQuery, "page">) {
  assertCan(ctx, "data.export");
  return tenantDb(ctx.organizationId).financeEntry.findMany({
    where: { ...entryWhere(query), voidedAt: query.voided ? { not: null } : null },
    include: entryInclude,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    take: 20_000,
  });
}

export async function getEntry(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.read");
  const entry = await tenantDb(ctx.organizationId).financeEntry.findFirst({
    where: { id },
    include: { ...entryInclude, salesPayment: { select: { documentId: true, document: { select: { number: true } } } } },
  });
  if (!entry) throw new NotFoundError();
  return entry;
}

/** Active categories (per kind) and sites for the entry form. Keeps the entry's current ones even if archived. */
export async function entryFormOptions(ctx: OrgContext, keep?: { categoryId?: string; siteId?: string | null }) {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    if (!ctx.access.readOnly) await ensureDefaultCategories(tx, ctx.organizationId);
    const [categories, sites] = await Promise.all([
      tx.financeCategory.findMany({
        where: { OR: [{ archivedAt: null }, ...(keep?.categoryId ? [{ id: keep.categoryId }] : [])] },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, nameEn: true, nameAr: true, systemKey: true },
      }),
      tx.site.findMany({
        where: { OR: [{ archivedAt: null }, ...(keep?.siteId ? [{ id: keep.siteId }] : [])] },
        orderBy: [{ client: { nameEn: "asc" } }, { name: "asc" }],
        select: { id: true, name: true, client: { select: { nameEn: true, nameAr: true } } },
      }),
    ]);
    return { categories: categories.filter(isManualCategory), sites };
  });
}

async function resolveEntryRefs(tx: TxClient, input: EntryInput, current?: { categoryId: string; siteId: string | null }) {
  const category = await tx.financeCategory.findFirst({ where: { id: input.categoryId }, select: { id: true, kind: true, systemKey: true, archivedAt: true } });
  const keepCategory = current?.categoryId === input.categoryId;
  if (!category || category.kind !== input.kind || !isManualCategory(category) || (category.archivedAt && !keepCategory)) {
    throw new FieldError("categoryId", "chooseCategory");
  }
  let clientId: string | null = null;
  if (input.siteId) {
    const site = await tx.site.findFirst({ where: { id: input.siteId }, select: { clientId: true, archivedAt: true } });
    if (!site || (site.archivedAt && current?.siteId !== input.siteId)) throw new FieldError("siteId", "chooseSite");
    clientId = site.clientId;
  }
  return { clientId };
}

function entryData(input: EntryInput) {
  return {
    kind: input.kind,
    categoryId: input.categoryId,
    date: input.date ?? todayInRiyadh(),
    amount: input.amount,
    vatAmount: input.includesVat ? vatFromGross(input.amount, financeConfig.vatRate) : 0,
    method: input.method,
    siteId: input.siteId,
    description: input.description ?? null,
    reference: input.reference ?? null,
  };
}

export async function createEntry(ctx: OrgContext, input: EntryInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    await ensureDefaultCategories(tx, ctx.organizationId);
    const { clientId } = await resolveEntryRefs(tx, input);
    const entry = await tx.financeEntry.create({ data: { ...entryData(input), clientId, organizationId: ctx.organizationId, source: "MANUAL", createdById: ctx.userId } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: input.kind === "INCOME" ? "finance.income_created" : "finance.expense_created",
      entityType: "FinanceEntry",
      entityId: entry.id,
      metadata: { amount: entry.amount, vat: entry.vatAmount, date: entry.date.toISOString().slice(0, 10) },
    });
    return entry;
  });
}

async function findEditable(tx: TxClient, id: string) {
  const entry = await tx.financeEntry.findFirst({ where: { id } });
  if (!entry) throw new NotFoundError();
  if (entry.source !== "MANUAL") throw new AppError("entryAutomatic");
  if (entry.voidedAt) throw new AppError("entryVoided");
  return entry;
}

/** Manual entries and refunds can be voided; payment and salary entries follow their source. */
async function findVoidable(tx: TxClient, id: string) {
  const entry = await tx.financeEntry.findFirst({ where: { id } });
  if (!entry) throw new NotFoundError();
  if (entry.source !== "MANUAL" && entry.source !== "INVOICE_REFUND") throw new AppError("entryAutomatic");
  if (entry.voidedAt) throw new AppError("entryVoided");
  return entry;
}

export async function updateEntry(ctx: OrgContext, id: string, input: EntryInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const before = await findEditable(tx, id);
    if (before.kind !== input.kind) throw new FieldError("categoryId", "chooseCategory");
    const { clientId } = await resolveEntryRefs(tx, input, before);
    const entry = await tx.financeEntry.update({ where: { id }, data: { ...entryData(input), clientId } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "finance.entry_updated",
      entityType: "FinanceEntry",
      entityId: id,
      metadata: { kind: entry.kind, from: { amount: before.amount, vat: before.vatAmount, date: before.date.toISOString().slice(0, 10) }, to: { amount: entry.amount, vat: entry.vatAmount, date: entry.date.toISOString().slice(0, 10) } },
    });
    return entry;
  });
}

/** A wrong entry is voided, not deleted: it leaves totals and reports but stays visible under "Voided". */
export async function voidEntry(ctx: OrgContext, id: string, reason: string | null) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const entry = await findVoidable(tx, id);
    await tx.financeEntry.update({ where: { id }, data: { voidedAt: new Date(), voidedById: ctx.userId, voidReason: reason } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "finance.entry_voided",
      entityType: "FinanceEntry",
      entityId: id,
      metadata: { kind: entry.kind, amount: entry.amount, date: entry.date.toISOString().slice(0, 10), reason },
    });
    return entry;
  });
}

/** Active sites with client names, for list filters. */
export async function siteFilterOptions(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).site.findMany({
    where: { archivedAt: null },
    orderBy: [{ client: { nameEn: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, client: { select: { nameEn: true, nameAr: true } } },
  });
}
