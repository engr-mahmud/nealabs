import type { BuyerSnapshot, SalesDocDetail, SellerSnapshot } from "./service";
import { zatcaQrPayload } from "./zatca-qr";

/** Seller name in the QR: the Arabic legal name when the company entered one. */
export function qrSellerName(seller: SellerSnapshot): string {
  return seller.nameAr?.trim() || seller.nameEn;
}

/** ZATCA Phase 1 QR payload for an issued tax invoice or credit note, or null for anything else. */
export function invoiceQr(doc: Pick<SalesDocDetail, "type" | "status" | "issuedAt" | "seller" | "total" | "vatAmount">): string | null {
  if ((doc.type !== "INVOICE" && doc.type !== "CREDIT_NOTE") || doc.status !== "SENT" || !doc.issuedAt || !doc.seller.vatNumber) return null;
  return zatcaQrPayload({ sellerName: qrSellerName(doc.seller), vatNumber: doc.seller.vatNumber, timestamp: doc.issuedAt, total: doc.total, vatAmount: doc.vatAmount });
}

/**
 * A tax invoice to a VAT-registered buyer is a (standard) tax invoice; to a buyer
 * without a VAT number it is a simplified tax invoice. Please verify with ZATCA
 * guidance for your case.
 */
export function invoiceKind(buyer: BuyerSnapshot): "standard" | "simplified" {
  return buyer.vatNumber ? "standard" : "simplified";
}
