/**
 * What the user sees as the status. Only DRAFT/SENT is stored; payment state comes
 * from the amounts and the due date, so it can never get out of sync.
 */
export type DisplayStatus = "draft" | "sent" | "converted" | "partial" | "paid" | "due" | "credited";

export interface StatusInput {
  type: "QUOTATION" | "PROFORMA" | "INVOICE" | "CREDIT_NOTE";
  status: "DRAFT" | "SENT";
  total: number;
  paidAmount: number;
  creditedAmount: number;
  /** max(0, total - paid - credited). */
  balance: number;
  dueDate: Date | null;
  converted: boolean;
}

/** `today` is the Saudi calendar day as a UTC-midnight date (see todayInRiyadh). */
export function displayStatus(doc: StatusInput, today: Date): DisplayStatus {
  if (doc.type !== "INVOICE") {
    if (doc.converted) return "converted";
    return doc.status === "DRAFT" ? "draft" : "sent";
  }
  if (doc.status === "DRAFT") return "draft";
  if (doc.balance === 0) return doc.creditedAmount >= doc.total ? "credited" : "paid";
  if (doc.dueDate && doc.dueDate.getTime() < today.getTime()) return "due";
  if (doc.paidAmount > 0 || doc.creditedAmount > 0) return "partial";
  return "sent";
}

export const statusTone: Record<DisplayStatus, "neutral" | "brand" | "warning" | "danger" | "success"> = {
  draft: "neutral",
  sent: "brand",
  converted: "success",
  partial: "warning",
  paid: "success",
  due: "danger",
  credited: "neutral",
};

/** URL slug ↔ document type. */
export const typeSlugs = { QUOTATION: "quotations", PROFORMA: "proformas", INVOICE: "invoices", CREDIT_NOTE: "credit-notes" } as const;
export type SalesTypeSlug = (typeof typeSlugs)[keyof typeof typeSlugs];
export type SalesType = keyof typeof typeSlugs;

export function typeFromSlug(slug: string): SalesType | null {
  const entry = Object.entries(typeSlugs).find(([, s]) => s === slug);
  return entry ? (entry[0] as SalesType) : null;
}

/** Allowed conversions: quotation → proforma or invoice, proforma → invoice. */
export const conversionTargets: Record<SalesType, SalesType[]> = {
  QUOTATION: ["PROFORMA", "INVOICE"],
  PROFORMA: ["INVOICE"],
  INVOICE: [],
  CREDIT_NOTE: [],
};

/** Legal tax documents: numbered only when issued, locked afterwards, carry the QR code. */
export function isTaxDocument(type: SalesType): boolean {
  return type === "INVOICE" || type === "CREDIT_NOTE";
}
