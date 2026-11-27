/** Settings for quotations, proforma invoices and tax invoices. Change here, not in components. */
export const salesConfig = {
  /** Standard Saudi VAT rate in basis points (1500 = 15%). Stored on each document for history. */
  vatRate: 1500,
  /** Number prefixes; the number part is zero-padded to `numberDigits`. */
  prefixes: { QUOTATION: "QT-", PROFORMA: "PI-", INVOICE: "INV-" },
  numberDigits: 5,
  /** Default days until an invoice is due, and until a quotation expires. */
  defaultDueDays: 30,
  defaultValidDays: 15,
  maxLines: 100,
  pageSize: 50,
} as const;
