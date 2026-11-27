import { z } from "zod";
import { isValidCrNumber, isValidSaudiVat, toAsciiDigits } from "@/lib/validators";
import { digitsOnly, optionalText, requiredText } from "@/lib/schema-helpers";

// Messages are translation keys under "validation".

/** Any phone a client may give (landline or mobile): digits with an optional leading +. */
export const contactPhone = optionalText(25)
  .transform((v) => (v ? toAsciiDigits(v).replace(/[\s\-().]/g, "") : v))
  .refine((v) => !v || /^\+?\d{7,15}$/.test(v), { error: "invalidContactPhone" });

export const optionalEmail = optionalText(254)
  .transform((v) => (v ? v.toLowerCase() : v))
  .refine((v) => !v || z.email().safeParse(v).success, { error: "invalidEmail" });

export const clientSchema = z.object({
  nameEn: requiredText(160, 2),
  nameAr: optionalText(160),
  vatNumber: optionalText(20)
    .transform((v) => (v ? digitsOnly(v) : v))
    .refine((v) => !v || isValidSaudiVat(v), { error: "invalidVat" }),
  crNumber: optionalText(20)
    .transform((v) => (v ? digitsOnly(v) : v))
    .refine((v) => !v || isValidCrNumber(v), { error: "invalidCr" }),
  contactName: optionalText(120),
  phone: contactPhone,
  email: optionalEmail,
  addressLine: optionalText(200),
  city: optionalText(80),
  postalCode: optionalText(10)
    .transform((v) => (v ? digitsOnly(v) : v))
    .refine((v) => !v || /^\d{5}$/.test(v), { error: "invalidPostalCode" }),
  notes: optionalText(1000),
});

export type ClientInput = z.infer<typeof clientSchema>;

const FORM_FIELDS = ["nameEn", "nameAr", "vatNumber", "crNumber", "contactName", "phone", "email", "addressLine", "city", "postalCode", "notes"] as const;

/** Plain string values for the client form (safe to pass to a client component). */
export function clientFormValues(client: Record<(typeof FORM_FIELDS)[number], string | null>): Record<string, string | null> {
  return Object.fromEntries(FORM_FIELDS.map((f) => [f, client[f]]));
}
