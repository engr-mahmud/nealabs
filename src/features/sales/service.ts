import { Prisma } from "@/generated/prisma/client";
import type { SalesDocType } from "@/generated/prisma/enums";
import { salesConfig } from "@/config/sales";
import { prisma, tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { AppError, FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { todayInRiyadh } from "@/features/master-data/expiry";
import type { PaymentInput, SalesDocInput } from "./schemas";
import { conversionTargets, isTaxDocument } from "./status";
import { computeTotals } from "./totals";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Seller details frozen on a document. */
export interface SellerSnapshot {
  nameEn: string;
  nameAr: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  bankName: string | null;
  bankAccountName: string | null;
  iban: string | null;
}

/** Buyer (client) details frozen on a document. */
export interface BuyerSnapshot {
  nameEn: string;
  nameAr: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
}

export type ListStatusFilter = "draft" | "sent" | "converted" | "unpaid" | "due" | "paid" | "";

export interface SalesListQuery {
  q: string;
  status: ListStatusFilter;
  page: number;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function formatDocNumber(type: SalesDocType, n: number): string {
  return `${salesConfig.prefixes[type]}${String(n).padStart(salesConfig.numberDigits, "0")}`;
}

/** Next number of a series. The upsert row lock keeps numbers unique and gapless under concurrency. */
async function nextNumber(tx: TxClient, organizationId: string, type: SalesDocType): Promise<string> {
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "document_counters" ("organizationId", "type", "lastNumber")
    VALUES (${organizationId}, ${type}::"SalesDocType", 1)
    ON CONFLICT ("organizationId", "type") DO UPDATE SET "lastNumber" = "document_counters"."lastNumber" + 1
    RETURNING "lastNumber"`;
  return formatDocNumber(type, rows[0]!.lastNumber);
}

async function sellerSnapshot(organizationId: string): Promise<SellerSnapshot> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  return {
    nameEn: org.nameEn,
    nameAr: org.nameAr,
    vatNumber: org.vatNumber,
    crNumber: org.crNumber,
    addressLine: org.addressLine,
    city: org.city,
    postalCode: org.postalCode,
    country: org.country,
    bankName: org.bankName,
    bankAccountName: org.bankAccountName,
    iban: org.iban,
  };
}

/** Loads the client (and site) for a document; both must be active and the site must belong to the client. */
async function loadParties(tx: TxClient, clientId: string, siteId: string | null, allowArchived = false) {
  // A credit note corrects an existing invoice, so it may go to a client archived since then.
  const client = await tx.client.findFirst({ where: { id: clientId, ...(allowArchived ? {} : { archivedAt: null }) } });
  if (!client) throw new FieldError("clientId", "chooseClient");
  if (siteId && !allowArchived) {
    const site = await tx.site.findFirst({ where: { id: siteId, clientId, archivedAt: null }, select: { id: true } });
    if (!site) throw new FieldError("siteId", "chooseSite");
  }
  const buyer: BuyerSnapshot = {
    nameEn: client.nameEn,
    nameAr: client.nameAr,
    vatNumber: client.vatNumber,
    crNumber: client.crNumber,
    addressLine: client.addressLine,
    city: client.city,
    postalCode: client.postalCode,
    contactName: client.contactName,
    phone: client.phone,
    email: client.email,
  };
  return { buyer };
}

function amounts(input: Pick<SalesDocInput, "lines" | "discountType" | "discountValue">, vatRate: number) {
  const totals = computeTotals({ lines: input.lines, discountType: input.discountType, discountValue: input.discountValue, vatRate });
  const lines = input.lines.map((l, i) => ({
    position: i,
    description: l.description,
    descriptionAr: l.descriptionAr ?? null,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    lineTotal: totals.lineTotals[i]!,
  }));
  return {
    lines,
    data: {
      discountType: input.discountType,
      discountValue: input.discountValue,
      vatRate,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      vatAmount: totals.vatAmount,
      total: totals.total,
      // Nothing is paid or credited while a document can still be edited.
      balance: totals.total,
    },
  };
}

function statusWhere(type: SalesDocType, status: ListStatusFilter, today: Date): Prisma.SalesDocumentWhereInput {
  const open = { balance: { gt: 0 } };
  switch (status) {
    case "draft":
      return { status: "DRAFT" };
    case "sent":
      return type === "INVOICE" || type === "CREDIT_NOTE" ? { status: "SENT" } : { status: "SENT", convertedTo: { is: null } };
    case "converted":
      return { convertedTo: { isNot: null } };
    case "unpaid":
      return { status: "SENT", ...open };
    case "due":
      return { status: "SENT", dueDate: { lt: today }, ...open };
    case "paid":
      return { status: "SENT", balance: 0 };
    default:
      return {};
  }
}

export async function listSalesDocs(ctx: OrgContext, type: SalesDocType, query: SalesListQuery, now = new Date()) {
  assertCan(ctx, "data.read");
  const today = todayInRiyadh(now);
  const where: Prisma.SalesDocumentWhereInput = {
    type,
    ...statusWhere(type, query.status, today),
    ...(query.q
      ? {
          OR: [
            { number: { contains: query.q, mode: "insensitive" } },
            { client: { nameEn: { contains: query.q, mode: "insensitive" } } },
            { client: { nameAr: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const take = salesConfig.pageSize;
  const db = tenantDb(ctx.organizationId);
  const [items, total] = await Promise.all([
    db.salesDocument.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take,
      skip: (query.page - 1) * take,
      select: {
        id: true,
        type: true,
        status: true,
        number: true,
        issueDate: true,
        dueDate: true,
        total: true,
        paidAmount: true,
        creditedAmount: true,
        balance: true,
        client: { select: { nameEn: true, nameAr: true } },
        site: { select: { name: true } },
        convertedTo: { select: { id: true } },
      },
    }),
    db.salesDocument.count({ where }),
  ]);
  return { items, total, page: query.page, pageCount: Math.max(1, Math.ceil(total / take)) };
}

/** Money still to collect on issued invoices, and how many are overdue. */
export async function receivablesSummary(ctx: OrgContext, now = new Date()) {
  assertCan(ctx, "data.read");
  const today = todayInRiyadh(now);
  const db = tenantDb(ctx.organizationId);
  const unpaid = { type: "INVOICE" as const, status: "SENT" as const, balance: { gt: 0 } };
  const [sums, overdue, unpaidCount] = await Promise.all([
    db.salesDocument.aggregate({ where: unpaid, _sum: { balance: true } }),
    db.salesDocument.count({ where: { ...unpaid, dueDate: { lt: today } } }),
    db.salesDocument.count({ where: unpaid }),
  ]);
  return { outstanding: sums._sum.balance ?? 0, overdueCount: overdue, unpaidCount };
}

export async function getSalesDoc(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.read");
  const doc = await tenantDb(ctx.organizationId).salesDocument.findFirst({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      payments: { orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }] },
      client: { select: { id: true, nameEn: true, nameAr: true, archivedAt: true } },
      site: { select: { id: true, name: true } },
      source: { select: { id: true, type: true, number: true } },
      convertedTo: { select: { id: true, type: true, number: true, status: true } },
      creditedInvoice: { select: { id: true, number: true, issuedAt: true, issueDate: true } },
      creditNotes: { orderBy: { createdAt: "asc" }, select: { id: true, number: true, status: true, total: true, issueDate: true } },
    },
  });
  if (!doc) throw new NotFoundError();
  return { ...doc, seller: doc.seller as unknown as SellerSnapshot, buyer: doc.buyer as unknown as BuyerSnapshot };
}

export type SalesDocDetail = Awaited<ReturnType<typeof getSalesDoc>>;

/** Whether the document's content (client, lines, amounts) may still change. */
export function isEditable(doc: { type: SalesDocType; status: string; convertedTo: unknown }): boolean {
  if (doc.convertedTo) return false;
  return !isTaxDocument(doc.type) || doc.status === "DRAFT";
}

export async function createSalesDoc(ctx: OrgContext, type: SalesDocType, input: SalesDocInput, now = new Date()) {
  assertCan(ctx, "data.write");
  const today = todayInRiyadh(now);
  const seller = await sellerSnapshot(ctx.organizationId);
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const { buyer } = await loadParties(tx, input.clientId, input.siteId);
    const { lines, data } = amounts(input, salesConfig.vatRate);
    if (type === "CREDIT_NOTE") throw new AppError("cannotConvert"); // use createCreditNote
    const issueDate = type === "INVOICE" ? today : (input.issueDate ?? today);
    const doc = await tx.salesDocument.create({
      data: {
        ...data,
        organizationId: ctx.organizationId,
        type,
        number: type === "INVOICE" ? null : await nextNumber(tx, ctx.organizationId, type),
        clientId: input.clientId,
        siteId: input.siteId,
        issueDate,
        dueDate: input.dueDate ?? addDays(issueDate, type === "QUOTATION" ? salesConfig.defaultValidDays : salesConfig.defaultDueDays),
        seller: seller as unknown as Prisma.InputJsonValue,
        buyer: buyer as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        createdById: ctx.userId,
        lines: { create: lines },
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "sales.created",
      entityType: "SalesDocument",
      entityId: doc.id,
      metadata: { type, number: doc.number, total: doc.total },
    });
    return doc;
  });
}

export async function updateSalesDoc(ctx: OrgContext, id: string, input: SalesDocInput) {
  assertCan(ctx, "data.write");
  const seller = await sellerSnapshot(ctx.organizationId);
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const current = await tx.salesDocument.findFirst({ where: { id }, include: { convertedTo: { select: { id: true } } } });
    if (!current) throw new NotFoundError();
    if (!isEditable(current)) throw new AppError("documentLocked");
    const isCredit = current.type === "CREDIT_NOTE";
    if (isCredit) {
      // A credit note always belongs to its invoice's client and site.
      input = { ...input, clientId: current.clientId, siteId: current.siteId };
      if (!input.reason) throw new FieldError("reason", "required");
    }
    const { buyer } = await loadParties(tx, input.clientId, input.siteId, isCredit);
    const { lines, data } = amounts(input, current.vatRate);
    if (isCredit) await assertCreditFits(tx, current.creditedInvoiceId!, data.total);
    const issueDate = isTaxDocument(current.type) ? current.issueDate : (input.issueDate ?? current.issueDate);
    await tx.salesDocumentLine.deleteMany({ where: { documentId: id } });
    const doc = await tx.salesDocument.update({
      where: { id },
      data: {
        ...data,
        clientId: input.clientId,
        siteId: input.siteId,
        issueDate,
        dueDate: input.dueDate ?? current.dueDate,
        seller: seller as unknown as Prisma.InputJsonValue,
        buyer: buyer as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        terms: input.terms ?? null,
        reason: isCredit ? input.reason : null,
        lines: { create: lines },
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "sales.updated",
      entityType: "SalesDocument",
      entityId: id,
      metadata: { type: doc.type, number: doc.number, oldTotal: current.total, total: doc.total },
    });
    return doc;
  });
}

/** Quotations and proformas: mark as sent to the client. */
export async function markSalesDocSent(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.write");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const doc = await tx.salesDocument.findFirst({ where: { id }, select: { type: true, status: true, number: true } });
    if (!doc) throw new NotFoundError();
    if (isTaxDocument(doc.type)) throw new AppError("documentLocked");
    if (doc.status === "SENT") return;
    await tx.salesDocument.update({ where: { id }, data: { status: "SENT" } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "sales.sent", entityType: "SalesDocument", entityId: id, metadata: { number: doc.number } });
  });
}

/**
 * Issues a draft tax invoice or credit note: gives it the next number of its series,
 * today's date and the exact issue time, freezes seller and buyer details, and locks
 * it against edits. A credit note also reduces its invoice's balance, never below
 * what the invoice can still be credited.
 */
export async function issueTaxDocument(ctx: OrgContext, id: string, now = new Date()) {
  assertCan(ctx, "data.write");
  const seller = await sellerSnapshot(ctx.organizationId);
  if (!seller.vatNumber) throw new AppError("sellerVatMissing");
  const today = todayInRiyadh(now);
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const doc = await tx.salesDocument.findFirst({ where: { id } });
    if (!doc) throw new NotFoundError();
    if (!isTaxDocument(doc.type)) throw new NotFoundError();
    if (doc.status !== "DRAFT") throw new AppError("alreadyIssued");
    const isCredit = doc.type === "CREDIT_NOTE";
    const { buyer } = await loadParties(tx, doc.clientId, doc.siteId, isCredit);
    const number = await nextNumber(tx, ctx.organizationId, doc.type);
    // Conditional update: two clicks at once cannot issue the same draft twice.
    const updated = await tx.salesDocument.updateMany({
      where: { id, status: "DRAFT" },
      data: {
        status: "SENT",
        number,
        issuedAt: now,
        issueDate: today,
        dueDate: isCredit ? null : doc.dueDate && doc.dueDate >= today ? doc.dueDate : today,
        seller: seller as unknown as Prisma.InputJsonValue,
        buyer: buyer as unknown as Prisma.InputJsonValue,
      },
    });
    if (updated.count !== 1) throw new AppError("alreadyIssued");
    if (isCredit) {
      // Atomic: parallel credit notes can never credit more than the invoice total.
      const credited = await tx.$executeRaw`
        UPDATE "sales_documents"
        SET "creditedAmount" = "creditedAmount" + ${doc.total},
            "balance" = GREATEST(0, "total" - "paidAmount" - "creditedAmount" - ${doc.total}),
            "updatedAt" = now()
        WHERE "id" = ${doc.creditedInvoiceId} AND "type" = 'INVOICE' AND "status" = 'SENT'
          AND "creditedAmount" + ${doc.total} <= "total"`;
      if (credited !== 1) throw new AppError("creditTooLarge");
    }
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: isCredit ? "credit_note.issued" : "invoice.issued",
      entityType: "SalesDocument",
      entityId: id,
      metadata: { number, total: doc.total, vatAmount: doc.vatAmount, ...(isCredit ? { invoiceId: doc.creditedInvoiceId } : {}) },
    });
    return { id, number };
  });
}

/** Kept for readability at call sites that only deal with invoices. */
export const issueInvoice = issueTaxDocument;

/** A credit note (draft or issued) may not take the invoice's credited total above its total. */
async function assertCreditFits(tx: TxClient, invoiceId: string, creditTotal: number) {
  const invoice = await tx.salesDocument.findFirst({ where: { id: invoiceId }, select: { total: true, creditedAmount: true } });
  if (!invoice) throw new NotFoundError();
  if (creditTotal > invoice.total - invoice.creditedAmount) throw new AppError("creditTooLarge");
}

/**
 * Starts a draft credit note for an issued tax invoice (to correct or cancel it, fully
 * or partly). Client, site and VAT rate come from the invoice; a reason is required.
 */
export async function createCreditNote(ctx: OrgContext, invoiceId: string, input: SalesDocInput, now = new Date()) {
  assertCan(ctx, "data.write");
  if (!input.reason) throw new FieldError("reason", "required");
  const today = todayInRiyadh(now);
  const seller = await sellerSnapshot(ctx.organizationId);
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const invoice = await tx.salesDocument.findFirst({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError();
    if (invoice.type !== "INVOICE" || invoice.status !== "SENT") throw new AppError("creditNeedsIssuedInvoice");
    const { buyer } = await loadParties(tx, invoice.clientId, invoice.siteId, true);
    const { lines, data } = amounts(input, invoice.vatRate);
    await assertCreditFits(tx, invoice.id, data.total);
    const doc = await tx.salesDocument.create({
      data: {
        ...data,
        organizationId: ctx.organizationId,
        type: "CREDIT_NOTE",
        number: null,
        clientId: invoice.clientId,
        siteId: invoice.siteId,
        creditedInvoiceId: invoice.id,
        reason: input.reason,
        issueDate: today,
        dueDate: null,
        seller: seller as unknown as Prisma.InputJsonValue,
        buyer: buyer as unknown as Prisma.InputJsonValue,
        notes: input.notes ?? null,
        terms: null,
        createdById: ctx.userId,
        lines: { create: lines },
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "sales.created",
      entityType: "SalesDocument",
      entityId: doc.id,
      metadata: { type: "CREDIT_NOTE", invoice: invoice.number, total: doc.total },
    });
    return doc;
  });
}

/** One-click conversion: quotation → proforma or tax invoice, proforma → tax invoice. Each document converts once. */
export async function convertSalesDoc(ctx: OrgContext, id: string, target: SalesDocType, now = new Date()) {
  assertCan(ctx, "data.write");
  const today = todayInRiyadh(now);
  const seller = await sellerSnapshot(ctx.organizationId);
  try {
    return await tenantTransaction(ctx.organizationId, async (tx) => {
      const source = await tx.salesDocument.findFirst({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, convertedTo: { select: { id: true } } } });
      if (!source) throw new NotFoundError();
      if (!conversionTargets[source.type].includes(target)) throw new AppError("cannotConvert");
      if (source.convertedTo) throw new AppError("alreadyConverted");
      const { buyer } = await loadParties(tx, source.clientId, source.siteId);
      const doc = await tx.salesDocument.create({
        data: {
          organizationId: ctx.organizationId,
          type: target,
          number: target === "INVOICE" ? null : await nextNumber(tx, ctx.organizationId, target),
          clientId: source.clientId,
          siteId: source.siteId,
          sourceId: source.id,
          issueDate: today,
          dueDate: addDays(today, salesConfig.defaultDueDays),
          seller: seller as unknown as Prisma.InputJsonValue,
          buyer: buyer as unknown as Prisma.InputJsonValue,
          discountType: source.discountType,
          discountValue: source.discountValue,
          vatRate: source.vatRate,
          subtotal: source.subtotal,
          discountAmount: source.discountAmount,
          taxableAmount: source.taxableAmount,
          vatAmount: source.vatAmount,
          total: source.total,
          balance: source.total,
          notes: source.notes,
          terms: source.terms,
          createdById: ctx.userId,
          lines: {
            create: source.lines.map((l) => ({
              position: l.position,
              description: l.description,
              descriptionAr: l.descriptionAr,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
            })),
          },
        },
      });
      if (source.status === "DRAFT") await tx.salesDocument.update({ where: { id }, data: { status: "SENT" } });
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        action: "sales.converted",
        entityType: "SalesDocument",
        entityId: doc.id,
        metadata: { from: source.number, fromType: source.type, toType: target, total: doc.total },
      });
      return doc;
    });
  } catch (e) {
    // Unique sourceId: a parallel click already converted it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppError("alreadyConverted");
    throw e;
  }
}

/** Drafts that were never issued or converted can be deleted. Issued tax invoices never can. */
export async function deleteDraft(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.write");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const doc = await tx.salesDocument.findFirst({ where: { id }, include: { convertedTo: { select: { id: true } } } });
    if (!doc) throw new NotFoundError();
    if (doc.status !== "DRAFT" || doc.convertedTo) throw new AppError("documentLocked");
    await tx.salesDocument.delete({ where: { id } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "sales.draft_deleted",
      entityType: "SalesDocument",
      entityId: id,
      metadata: { type: doc.type, number: doc.number, total: doc.total },
    });
  });
  return null;
}

export async function addPayment(ctx: OrgContext, documentId: string, input: PaymentInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const doc = await tx.salesDocument.findFirst({ where: { id: documentId }, select: { type: true, status: true, number: true } });
    if (!doc) throw new NotFoundError();
    if (doc.type !== "INVOICE" || doc.status !== "SENT") throw new AppError("issueBeforePayment");
    // Conditional update: never more than the balance due, even with parallel requests.
    const updated = await tx.salesDocument.updateMany({
      where: { id: documentId, balance: { gte: input.amount } },
      data: { paidAmount: { increment: input.amount }, balance: { decrement: input.amount } },
    });
    if (updated.count !== 1) throw new FieldError("amount", "paymentTooLarge");
    const payment = await tx.salesPayment.create({
      data: {
        organizationId: ctx.organizationId,
        documentId,
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method,
        reference: input.reference ?? null,
        note: input.note ?? null,
        createdById: ctx.userId,
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "payment.added",
      entityType: "SalesPayment",
      entityId: payment.id,
      metadata: { invoice: doc.number, amount: input.amount, method: input.method },
    });
    return payment;
  });
}

/** Removes a payment entered by mistake. The audit log keeps the amount and who removed it. */
export async function deletePayment(ctx: OrgContext, paymentId: string) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const payment = await tx.salesPayment.findFirst({ where: { id: paymentId }, include: { document: { select: { number: true } } } });
    if (!payment) throw new NotFoundError();
    await tx.salesPayment.delete({ where: { id: paymentId } });
    await tx.$executeRaw`
      UPDATE "sales_documents"
      SET "paidAmount" = "paidAmount" - ${payment.amount},
          "balance" = GREATEST(0, "total" - ("paidAmount" - ${payment.amount}) - "creditedAmount"),
          "updatedAt" = now()
      WHERE "id" = ${payment.documentId}`;
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "payment.deleted",
      entityType: "SalesPayment",
      entityId: paymentId,
      metadata: { invoice: payment.document.number, amount: payment.amount, paidOn: payment.paidOn.toISOString().slice(0, 10) },
    });
    return payment.documentId;
  });
}

/** Clients with their active sites, for the document form. */
export async function listClientsWithSites(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).client.findMany({
    where: { archivedAt: null },
    select: { id: true, nameEn: true, nameAr: true, sites: { where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } } },
    orderBy: { nameEn: "asc" },
  });
}

/** Latest documents of a client, for the client page. */
export async function listClientDocs(ctx: OrgContext, clientId: string) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).salesDocument.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, type: true, status: true, number: true, issueDate: true, dueDate: true, total: true, paidAmount: true, creditedAmount: true, balance: true, convertedTo: { select: { id: true } } },
  });
}
