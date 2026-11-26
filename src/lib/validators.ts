/** Saudi VAT registration number: 15 digits, starting and ending with 3. */
export function isValidSaudiVat(value: string): boolean {
  return /^3\d{13}3$/.test(value);
}

/** Commercial Registration number: 10 digits. */
export function isValidCrNumber(value: string): boolean {
  return /^\d{10}$/.test(value);
}

/** Saudi IBAN: "SA" + 22 characters, verified with the ISO 13616 mod-97 check. */
export function isValidSaudiIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^SA\d{22}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const ch of digits) remainder = (remainder * 10 + Number(ch)) % 97;
  return remainder === 1;
}

export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Converts Arabic-Indic digits to ASCII so users can type either. */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}
