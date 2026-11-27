/**
 * The company that sells the software subscription (the seller on subscription tax
 * invoices). These are placeholders: fill in the real legal name, VAT number, CR number
 * and address before taking real payments. A VAT number is needed to issue tax invoices.
 */
export const softwareSeller = {
  legalNameEn: "NeaLabs (legal name to be confirmed)",
  legalNameAr: "نيالابس (الاسم النظامي قيد التأكيد)",
  /** 15 digits, starts and ends with 3. Placeholder: replace before launch. */
  vatNumber: "300000000000003",
  crNumber: "0000000000",
  addressLine: "Eastern Province",
  city: "Dammam",
  postalCode: "",
  country: "SA",
} as const;

export type SoftwareSeller = typeof softwareSeller;
