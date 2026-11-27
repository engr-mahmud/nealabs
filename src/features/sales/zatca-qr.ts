import { AppError } from "@/lib/errors";

/**
 * ZATCA e-invoicing Phase 1 (generation phase) QR payload: five TLV fields
 * (tag byte, length byte, UTF-8 value), Base64 encoded.
 *   1 seller name, 2 seller VAT number, 3 invoice timestamp (ISO 8601),
 *   4 invoice total with VAT, 5 VAT total.
 * Phase 2 (integration with the Fatoora platform, cryptographic stamp) is a later step.
 * Verify against ZATCA's current "E-Invoicing Detailed Guidelines" before launch.
 */
export interface ZatcaQrInput {
  sellerName: string;
  vatNumber: string;
  timestamp: Date;
  /** Halalas, including VAT. */
  total: number;
  /** Halalas. */
  vatAmount: number;
}

function tlv(tag: number, value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  // Phase 1 uses a single length byte.
  if (bytes.length > 255) throw new AppError("qrValueTooLong");
  return Buffer.concat([Buffer.from([tag, bytes.length]), bytes]);
}

/** Halalas → "1150.00". */
export function amountString(halalas: number): string {
  return `${Math.trunc(halalas / 100)}.${String(halalas % 100).padStart(2, "0")}`;
}

/** UTC ISO 8601 without milliseconds, e.g. "2026-11-27T09:30:00Z". */
export function qrTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function zatcaQrPayload(input: ZatcaQrInput): string {
  return Buffer.concat([
    tlv(1, input.sellerName.trim()),
    tlv(2, input.vatNumber),
    tlv(3, qrTimestamp(input.timestamp)),
    tlv(4, amountString(input.total)),
    tlv(5, amountString(input.vatAmount)),
  ]).toString("base64");
}

/** Reads a payload back into its fields (used in tests and for support checks). */
export function decodeZatcaQr(base64: string): Record<number, string> {
  const buf = Buffer.from(base64, "base64");
  const out: Record<number, string> = {};
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i]!;
    const len = buf[i + 1]!;
    out[tag] = buf.subarray(i + 2, i + 2 + len).toString("utf8");
    i += 2 + len;
  }
  return out;
}
