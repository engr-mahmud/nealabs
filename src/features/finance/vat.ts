import { mulDivRound } from "@/features/sales/totals";

/** VAT part of an amount that includes VAT at `rateBp` (1500 = 15%): amount × rate / (1 + rate). */
export function vatFromGross(amount: number, rateBp: number): number {
  if (amount <= 0 || rateBp <= 0) return 0;
  return mulDivRound(amount, rateBp, 10_000 + rateBp);
}

/**
 * VAT part of one payment against an invoice. Payments are matched to the invoice's VAT
 * pro rata, using the running total so that rounding never drifts: once the invoice is
 * fully paid, the VAT parts of its payments add up exactly to the invoice VAT.
 */
export function paymentVatShare(invoice: { total: number; vatAmount: number }, paidBefore: number, amount: number): number {
  if (invoice.total <= 0 || invoice.vatAmount <= 0) return 0;
  const before = mulDivRound(paidBefore, invoice.vatAmount, invoice.total);
  const after = mulDivRound(paidBefore + amount, invoice.vatAmount, invoice.total);
  return Math.max(0, Math.min(amount, after - before));
}

/** Amount without VAT, used for profit (VAT collected belongs to the government, VAT paid is reclaimed). */
export function netOfVat(entry: { amount: number; vatAmount: number }): number {
  return entry.amount - entry.vatAmount;
}
