import { toAsciiDigits } from "@/lib/validators";

/**
 * Document totals in integer halalas. Pure and shared by the form preview and the
 * server, so what the user sees is exactly what is saved. Rounding: half up, once
 * per line, once for the discount and once for VAT on the whole taxable amount.
 */

export type DiscountKind = "NONE" | "PERCENT" | "AMOUNT";

export interface LineInput {
  /** Thousandths (1500 = 1.5). */
  quantity: number;
  /** Halalas, excluding VAT. */
  unitPrice: number;
}

export interface TotalsInput {
  lines: LineInput[];
  discountType: DiscountKind;
  /** Basis points for PERCENT (1000 = 10%), halalas for AMOUNT. */
  discountValue: number;
  /** Basis points (1500 = 15%). */
  vatRate: number;
}

export interface Totals {
  lineTotals: number[];
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  vatAmount: number;
  total: number;
}

/** round(a * b / d) for non-negative integers, half up, without float or overflow errors. */
export function mulDivRound(a: number, b: number, d: number): number {
  const n = BigInt(a) * BigInt(b);
  const den = BigInt(d);
  return Number((n * 2n + den) / (den * 2n));
}

export function lineTotal(line: LineInput): number {
  return mulDivRound(line.quantity, line.unitPrice, 1000);
}

export function computeTotals(input: TotalsInput): Totals {
  const lineTotals = input.lines.map(lineTotal);
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  let discountAmount = 0;
  if (input.discountType === "PERCENT") discountAmount = mulDivRound(subtotal, Math.min(input.discountValue, 10000), 10000);
  if (input.discountType === "AMOUNT") discountAmount = Math.min(input.discountValue, subtotal);
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = mulDivRound(taxableAmount, input.vatRate, 10000);
  return { lineTotals, subtotal, discountAmount, taxableAmount, vatAmount, total: taxableAmount + vatAmount };
}

/** "1.5" / "26" / "٢٦" → thousandths. Null if not a positive number with at most 3 decimals. */
export function parseQuantity(raw: string): number | null {
  const v = toAsciiDigits(raw)
    .trim()
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
  const m = /^(\d{1,7})(?:\.(\d{1,3}))?$/.exec(v);
  if (!m) return null;
  const q = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
  return q > 0 ? q : null;
}

/** Thousandths → "1.5" / "26". */
export function formatQuantity(q: number): string {
  const whole = Math.trunc(q / 1000);
  const rest = q % 1000;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(3, "0").replace(/0+$/, "")}`;
}

/** "10" / "12.5" (percent) → basis points. Null if not between 0 and 100 with at most 2 decimals. */
export function parsePercent(raw: string): number | null {
  const v = toAsciiDigits(raw).trim().replace("٫", ".");
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp <= 10000 ? bp : null;
}

export function formatPercent(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = bp % 100;
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0").replace(/0+$/, "")}`;
}
