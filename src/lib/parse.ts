import { toAsciiDigits } from "@/lib/validators";

/**
 * Parses an amount in SAR ("1500", "1,500.50", "١٥٠٠") to integer halalas without
 * floating point. Returns null for anything that is not a valid non-negative amount
 * with at most 2 decimals.
 */
export function parseSarToHalalas(raw: string): number | null {
  const v = toAsciiDigits(raw).trim().replace(/[,\s٬]/g, "").replace("٫", ".");
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Integer halalas as a plain "1500.50" / "1500" string for form inputs and Excel. */
export function halalasToInput(halalas: number): string {
  const sar = Math.trunc(halalas / 100);
  const rest = halalas % 100;
  return rest === 0 ? String(sar) : `${sar}.${String(rest).padStart(2, "0")}`;
}

/**
 * Parses a calendar date typed by a user or found in Excel: "2027-03-15", "15/03/2027",
 * "15-03-2027" or "15.03.2027" (day first, as used in Saudi Arabia). Returns a UTC
 * midnight Date, or null if the date does not exist.
 */
export function parseDateInput(raw: string): Date | null {
  const v = toAsciiDigits(raw).trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** "YYYY-MM-DD" for a date-only value (stored as UTC midnight). */
export function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}
