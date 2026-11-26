import { z } from "zod";
import { isValidCrNumber, isValidSaudiIban, isValidSaudiVat, normalizeIban, toAsciiDigits } from "@/lib/validators";
import { emailSchema } from "@/features/auth/schemas";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const digits = (v: string) => toAsciiDigits(v).replace(/\s+/g, "");

export const companyNameSchema = z.object({
  nameEn: z.string().trim().min(2, { error: "required" }).max(120, { error: "tooLong" }),
  nameAr: optionalText(120),
});

export const companyLegalSchema = z.object({
  crNumber: optionalText(20)
    .transform((v) => (v ? digits(v) : v))
    .refine((v) => !v || isValidCrNumber(v), { error: "invalidCr" }),
  vatNumber: optionalText(20)
    .transform((v) => (v ? digits(v) : v))
    .refine((v) => !v || isValidSaudiVat(v), { error: "invalidVat" }),
  addressLine: optionalText(200),
  city: optionalText(80),
  postalCode: optionalText(10)
    .transform((v) => (v ? digits(v) : v))
    .refine((v) => !v || /^\d{5}$/.test(v), { error: "invalidPostalCode" }),
});

export const companyBankSchema = z.object({
  bankName: optionalText(100),
  bankAccountName: optionalText(120),
  iban: optionalText(40)
    .transform((v) => (v ? normalizeIban(toAsciiDigits(v)) : v))
    .refine((v) => !v || isValidSaudiIban(v), { error: "invalidIban" }),
});

export const organizationSchema = companyNameSchema.extend(companyLegalSchema.shape).extend(companyBankSchema.shape);

export type CompanyNameInput = z.infer<typeof companyNameSchema>;
export type OrganizationInput = z.infer<typeof organizationSchema>;
export type OrganizationUpdate = Partial<OrganizationInput>;

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["OWNER", "ACCOUNTANT"], { error: "required" }),
});

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
