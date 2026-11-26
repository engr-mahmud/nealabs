import { toAsciiDigits } from "./validators";

/**
 * Normalizes a Saudi mobile number to E.164 (+9665XXXXXXXX).
 * Accepts 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX,
 * spaces/dashes and Arabic-Indic digits. Returns null for anything else.
 */
export function normalizeSaudiMobile(raw: string): string | null {
  let digits = toAsciiDigits(raw).replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return /^5\d{8}$/.test(digits) ? `+966${digits}` : null;
}

/**
 * "+966 5X• ••• ••12" style mask for display; never log full numbers.
 * Non-breaking spaces keep it on one line; LRI/PDI marks keep it left-to-right inside Arabic text.
 */
export function maskPhone(e164: string): string {
  const local = e164.replace(/^\+966/, "");
  return `\u2066+966\u00a0${local.slice(0, 2)}•\u00a0•••\u00a0••${local.slice(-2)}\u2069`;
}
