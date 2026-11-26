import type { Organization } from "@/generated/prisma/client";

export type OrgValues = Partial<Record<string, string | null>>;

const FIELDS = ["nameEn", "nameAr", "crNumber", "vatNumber", "addressLine", "city", "postalCode", "bankName", "bankAccountName", "iban"] as const;

/** Plain string values for organization forms (safe to pass to client components). */
export function orgFormValues(org: Organization): OrgValues {
  return Object.fromEntries(FIELDS.map((f) => [f, org[f]]));
}
