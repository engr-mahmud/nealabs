import { beforeEach, describe, expect, it } from "vitest";
import { prisma, systemDb, tenantDb } from "@/lib/db";
import { FieldError, NotFoundError, ReadOnlyError } from "@/lib/errors";
import { updateOrganization } from "@/features/organizations/service";
import type { OrgContext } from "@/features/organizations/context";
import type { SalesDocInput } from "@/features/sales/schemas";
import {
  addPayment,
  convertSalesDoc,
  createSalesDoc,
  deleteDraft,
  deletePayment,
  getSalesDoc,
  issueInvoice,
  listSalesDocs,
  markSalesDocSent,
  receivablesSummary,
  updateSalesDoc,
} from "@/features/sales/service";
import { decodeZatcaQr } from "@/features/sales/zatca-qr";
import { invoiceQr } from "@/features/sales/document-data";
import { addMember, createOwnerWithOrg, orgWithSite, resetDb } from "./helpers";

const DAY = 86_400_000;
const q = { q: "", status: "" as const, page: 1 };

function docInput(clientId: string, extra: Partial<SalesDocInput> = {}): SalesDocInput {
  return {
    clientId,
    siteId: null,
    issueDate: null,
    dueDate: null,
    discountType: "NONE",
    discountValue: 0,
    notes: null,
    terms: null,
    lines: [
      { description: "Helpers - November", descriptionAr: "عمال - نوفمبر", quantity: 26000, unitPrice: 8000 },
      { description: "Supervisor", descriptionAr: null, quantity: 1000, unitPrice: 350000 },
    ],
    ...extra,
  };
}

async function withVat(ctx: OrgContext) {
  await updateOrganization(ctx, { nameAr: "شركة ألفا", vatNumber: "300000000000003", crNumber: "1010101010" });
}

async function setup(name = "Alpha") {
  const o = await orgWithSite(name);
  await withVat(o.ctx);
  return o;
}

describe("sales documents: flow", () => {
  beforeEach(resetDb);

  it("quotation → proforma → tax invoice with the same lines and totals", async () => {
    const { ctx, client, site } = await setup();
    const quote = await createSalesDoc(ctx, "QUOTATION", docInput(client.id, { siteId: site.id, discountType: "PERCENT", discountValue: 500 }));
    expect(quote.number).toBe("QT-00001");
    // 26 x 80 + 3500 = 5580; 5% off = 279 → 5301; VAT 795.15 → total 6096.15
    expect(quote).toMatchObject({ subtotal: 558000, discountAmount: 27900, taxableAmount: 530100, vatAmount: 79515, total: 609615, status: "DRAFT" });

    const proforma = await convertSalesDoc(ctx, quote.id, "PROFORMA");
    expect(proforma).toMatchObject({ type: "PROFORMA", number: "PI-00001", sourceId: quote.id, total: 609615, siteId: site.id });
    expect((await getSalesDoc(ctx, quote.id)).status).toBe("SENT");

    const invoice = await convertSalesDoc(ctx, proforma.id, "INVOICE");
    expect(invoice).toMatchObject({ type: "INVOICE", status: "DRAFT", number: null, total: 609615 });
    const lines = (await getSalesDoc(ctx, invoice.id)).lines;
    expect(lines.map((l) => [l.description, l.descriptionAr, l.quantity, l.lineTotal])).toEqual([
      ["Helpers - November", "عمال - نوفمبر", 26000, 208000],
      ["Supervisor", null, 1000, 350000],
    ]);

    await expect(convertSalesDoc(ctx, proforma.id, "INVOICE")).rejects.toMatchObject({ code: "alreadyConverted" });
    await expect(convertSalesDoc(ctx, invoice.id, "PROFORMA")).rejects.toMatchObject({ code: "cannotConvert" });
    // A converted document is locked.
    await expect(updateSalesDoc(ctx, quote.id, docInput(client.id))).rejects.toMatchObject({ code: "documentLocked" });
  });

  it("parallel clicks convert a document only once", async () => {
    const { ctx, client } = await setup();
    const quote = await createSalesDoc(ctx, "QUOTATION", docInput(client.id));
    const results = await Promise.allSettled([convertSalesDoc(ctx, quote.id, "INVOICE"), convertSalesDoc(ctx, quote.id, "INVOICE")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await tenantDb(ctx.organizationId).salesDocument.count({ where: { type: "INVOICE" } })).toBe(1);
  });

  it("issuing numbers invoices in order, freezes them and builds the QR", async () => {
    const { ctx, client } = await setup();
    const d1 = await createSalesDoc(ctx, "INVOICE", docInput(client.id));
    const d2 = await createSalesDoc(ctx, "INVOICE", docInput(client.id));
    const now = new Date("2026-11-27T09:30:15.500Z");
    // Issue the second draft first: numbers follow issue order, with no gaps from drafts.
    expect((await issueInvoice(ctx, d2.id, now)).number).toBe("INV-00001");
    expect((await issueInvoice(ctx, d1.id, now)).number).toBe("INV-00002");
    await expect(issueInvoice(ctx, d1.id)).rejects.toMatchObject({ code: "alreadyIssued" });

    const doc = await getSalesDoc(ctx, d2.id);
    expect(doc).toMatchObject({ status: "SENT", issuedAt: now, issueDate: new Date("2026-11-27T00:00:00Z") });
    expect(doc.seller).toMatchObject({ nameAr: "شركة ألفا", vatNumber: "300000000000003" });
    expect(doc.buyer.nameEn).toBe("Alpha Client");

    await expect(updateSalesDoc(ctx, d2.id, docInput(client.id))).rejects.toMatchObject({ code: "documentLocked" });
    await expect(deleteDraft(ctx, d2.id)).rejects.toMatchObject({ code: "documentLocked" });

    // Company edits later do not change the issued invoice.
    await updateOrganization(ctx, { nameEn: "Renamed", nameAr: "اسم جديد" });
    const qr = decodeZatcaQr(invoiceQr(await getSalesDoc(ctx, d2.id))!);
    expect(qr).toEqual({ 1: "شركة ألفا", 2: "300000000000003", 3: "2026-11-27T09:30:15Z", 4: "6417.00", 5: "837.00" });
  });

  it("parallel issuing gives unique numbers", async () => {
    const { ctx, client } = await setup();
    const drafts = await Promise.all(Array.from({ length: 5 }, () => createSalesDoc(ctx, "INVOICE", docInput(client.id))));
    const issued = await Promise.all(drafts.map((d) => issueInvoice(ctx, d.id)));
    expect(issued.map((i) => i.number).sort()).toEqual(["INV-00001", "INV-00002", "INV-00003", "INV-00004", "INV-00005"]);
  });

  it("needs the company VAT number before issuing a tax invoice", async () => {
    const { ctx, client } = await orgWithSite("NoVat");
    const draft = await createSalesDoc(ctx, "INVOICE", docInput(client.id));
    await expect(issueInvoice(ctx, draft.id)).rejects.toMatchObject({ code: "sellerVatMissing" });
  });

  it("each company has its own number series", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    expect((await createSalesDoc(a.ctx, "QUOTATION", docInput(a.client.id))).number).toBe("QT-00001");
    expect((await createSalesDoc(b.ctx, "QUOTATION", docInput(b.client.id))).number).toBe("QT-00001");
    expect((await createSalesDoc(a.ctx, "QUOTATION", docInput(a.client.id))).number).toBe("QT-00002");
  });

  it("drafts can be edited and deleted; a quotation can be marked as sent", async () => {
    const { ctx, client } = await setup();
    const draft = await createSalesDoc(ctx, "INVOICE", docInput(client.id));
    const updated = await updateSalesDoc(ctx, draft.id, docInput(client.id, { lines: [{ description: "One", descriptionAr: null, quantity: 2000, unitPrice: 10000 }] }));
    expect(updated.total).toBe(23000);
    expect((await getSalesDoc(ctx, draft.id)).lines).toHaveLength(1);
    await deleteDraft(ctx, draft.id);
    await expect(getSalesDoc(ctx, draft.id)).rejects.toBeInstanceOf(NotFoundError);

    const quote = await createSalesDoc(ctx, "QUOTATION", docInput(client.id));
    await markSalesDocSent(ctx, quote.id);
    expect((await getSalesDoc(ctx, quote.id)).status).toBe("SENT");
    // A quotation stays editable until it is converted.
    expect((await updateSalesDoc(ctx, quote.id, docInput(client.id))).status).toBe("SENT");
  });

  it("refuses a site that belongs to another client", async () => {
    const { ctx, site } = await setup();
    const { createClient } = await import("@/features/clients/service");
    const other = await createClient(ctx, { nameEn: "Other", nameAr: null, vatNumber: null, crNumber: null, contactName: null, phone: null, email: null, addressLine: null, city: null, postalCode: null, notes: null });
    await expect(createSalesDoc(ctx, "QUOTATION", docInput(other.id, { siteId: site.id }))).rejects.toBeInstanceOf(FieldError);
  });
});

describe("payments", () => {
  beforeEach(resetDb);

  async function issued() {
    const o = await setup();
    const draft = await createSalesDoc(o.ctx, "INVOICE", docInput(o.client.id, { lines: [{ description: "Work", descriptionAr: null, quantity: 1000, unitPrice: 100000 }] }));
    await issueInvoice(o.ctx, draft.id);
    return { ...o, id: draft.id };
  }

  it("partial then full payment; overpayment is refused", async () => {
    const { ctx, id } = await issued();
    const paidOn = new Date("2026-11-27T00:00:00Z");
    await addPayment(ctx, id, { amount: 50000, paidOn, method: "BANK_TRANSFER" });
    expect((await getSalesDoc(ctx, id)).paidAmount).toBe(50000);
    await expect(addPayment(ctx, id, { amount: 65001, paidOn, method: "CASH" })).rejects.toMatchObject({ field: "amount", code: "paymentTooLarge" });
    const p = await addPayment(ctx, id, { amount: 65000, paidOn, method: "CASH", reference: "R-1" });
    expect((await getSalesDoc(ctx, id)).paidAmount).toBe(115000);
    expect((await listSalesDocs(ctx, "INVOICE", { ...q, status: "paid" })).total).toBe(1);

    await deletePayment(ctx, p.id);
    expect((await getSalesDoc(ctx, id)).paidAmount).toBe(50000);
    expect((await listSalesDocs(ctx, "INVOICE", { ...q, status: "unpaid" })).total).toBe(1);
    expect(await receivablesSummary(ctx)).toMatchObject({ outstanding: 65000, unpaidCount: 1, overdueCount: 0 });

    const audit = await tenantDb(ctx.organizationId).auditLog.findMany({ where: { action: { startsWith: "payment." } }, orderBy: { createdAt: "asc" } });
    expect(audit.map((a) => a.action)).toEqual(["payment.added", "payment.added", "payment.deleted"]);
  });

  it("parallel payments cannot exceed the total", async () => {
    const { ctx, id } = await issued();
    const paidOn = new Date();
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => addPayment(ctx, id, { amount: 40000, paidOn, method: "CASH" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await getSalesDoc(ctx, id)).paidAmount).toBe(80000);
  });

  it("payments only on issued invoices", async () => {
    const { ctx, client } = await setup();
    const draft = await createSalesDoc(ctx, "INVOICE", docInput(client.id));
    const quote = await createSalesDoc(ctx, "QUOTATION", docInput(client.id));
    for (const id of [draft.id, quote.id]) {
      await expect(addPayment(ctx, id, { amount: 100, paidOn: new Date(), method: "CASH" })).rejects.toMatchObject({ code: "issueBeforePayment" });
    }
  });

  it("lists overdue invoices", async () => {
    const { ctx, id } = await issued();
    const later = new Date(Date.now() + 60 * DAY);
    expect((await listSalesDocs(ctx, "INVOICE", { ...q, status: "due" }, later)).items.map((d) => d.id)).toEqual([id]);
    expect((await listSalesDocs(ctx, "INVOICE", { ...q, status: "due" })).total).toBe(0);
  });
});

describe("sales documents: tenant isolation and access", () => {
  beforeEach(resetDb);

  it("RLS hides other companies' documents, lines and payments", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    const inv = await createSalesDoc(b.ctx, "INVOICE", docInput(b.client.id));
    await issueInvoice(b.ctx, inv.id);
    await addPayment(b.ctx, inv.id, { amount: 100, paidOn: new Date(), method: "CASH" });

    const dbA = tenantDb(a.org.id);
    expect(await dbA.salesDocument.count()).toBe(0);
    expect(await dbA.salesDocumentLine.count()).toBe(0);
    expect(await dbA.salesPayment.count()).toBe(0);
    expect(await dbA.documentCounter.count()).toBe(0);
    expect(await prisma.salesDocument.count()).toBe(0); // no tenant set: fails closed
    expect(await systemDb().salesDocument.count()).toBe(1);
  });

  it("services cannot read, convert, issue or pay another company's documents", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    const quote = await createSalesDoc(b.ctx, "QUOTATION", docInput(b.client.id));
    const inv = await createSalesDoc(b.ctx, "INVOICE", docInput(b.client.id));
    await expect(getSalesDoc(a.ctx, quote.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(convertSalesDoc(a.ctx, quote.id, "INVOICE")).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateSalesDoc(a.ctx, quote.id, docInput(a.client.id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(issueInvoice(a.ctx, inv.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addPayment(a.ctx, inv.id, { amount: 100, paidOn: new Date(), method: "CASH" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteDraft(a.ctx, inv.id)).rejects.toBeInstanceOf(NotFoundError);
    // Another company's client cannot be used on a document.
    await expect(createSalesDoc(a.ctx, "QUOTATION", docInput(b.client.id))).rejects.toMatchObject({ field: "clientId" });
    expect((await listSalesDocs(a.ctx, "QUOTATION", q)).total).toBe(0);
  });

  it("the database refuses a line or payment pointing at another company's document", async () => {
    const a = await setup("Alpha");
    const b = await setup("Beta");
    const inv = await createSalesDoc(b.ctx, "INVOICE", docInput(b.client.id));
    await expect(
      systemDb().salesDocumentLine.create({ data: { organizationId: a.org.id, documentId: inv.id, position: 9, description: "x", quantity: 1000, unitPrice: 1, lineTotal: 1 } }),
    ).rejects.toThrow();
    await expect(
      systemDb().salesPayment.create({ data: { organizationId: a.org.id, documentId: inv.id, amount: 1, paidOn: new Date(), method: "CASH" } }),
    ).rejects.toThrow();
  });

  it("accountants can create and issue invoices", async () => {
    const a = await setup();
    const acc = await addMember(a.org.id, "ACCOUNTANT");
    const draft = await createSalesDoc(acc.ctx, "INVOICE", docInput(a.client.id));
    expect((await issueInvoice(acc.ctx, draft.id)).number).toBe("INV-00001");
  });

  it("a read-only company can view documents but not create, issue or record payments", async () => {
    const a = await setup();
    const inv = await createSalesDoc(a.ctx, "INVOICE", docInput(a.client.id));
    const { ctx: expiredCtx } = await createOwnerWithOrg("Expired", new Date(Date.now() - 30 * DAY));
    const readOnly: OrgContext = { ...a.ctx, access: expiredCtx.access };
    expect(readOnly.access.readOnly).toBe(true);
    await expect(createSalesDoc(readOnly, "QUOTATION", docInput(a.client.id))).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(issueInvoice(readOnly, inv.id)).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(addPayment(readOnly, inv.id, { amount: 1, paidOn: new Date(), method: "CASH" })).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await getSalesDoc(readOnly, inv.id)).id).toBe(inv.id);
  });

  it("database checks keep amounts consistent", async () => {
    const a = await setup();
    const inv = await createSalesDoc(a.ctx, "INVOICE", docInput(a.client.id));
    await expect(tenantDb(a.org.id).salesDocument.update({ where: { id: inv.id }, data: { total: 1 } })).rejects.toThrow();
    await expect(tenantDb(a.org.id).salesDocument.update({ where: { id: inv.id }, data: { status: "SENT" } })).rejects.toThrow(); // no number
  });
});
