import { z } from "zod";
import { normalizeSaudiMobile } from "@/lib/phone";
import { digitsOnly, optionalDate, optionalText, requiredText, sarAmount } from "@/lib/schema-helpers";
import { toAsciiDigits } from "@/lib/validators";

/**
 * Iqama (resident ID) or Saudi national ID: 10 digits, starting with 2 (resident) or 1 (citizen).
 * Please verify against the official Absher / Ministry of Interior format before relying on it.
 */
export function isValidIqama(value: string): boolean {
  return /^[12]\d{9}$/.test(value);
}

export const iqamaSchema = z
  .string()
  .transform(digitsOnly)
  .pipe(z.string().min(1, { error: "required" }).refine(isValidIqama, { error: "invalidIqama" }));

const passportSchema = optionalText(30)
  .transform((v) => (v ? toAsciiDigits(v).replace(/\s+/g, "").toUpperCase() : v))
  .refine((v) => !v || /^[A-Z0-9]{5,20}$/.test(v), { error: "invalidPassport" });

const workerPhone = optionalText(25).transform((v, ctx) => {
  if (!v) return v;
  const phone = normalizeSaudiMobile(v);
  if (!phone) {
    ctx.addIssue({ code: "custom", message: "invalidPhone" });
    return z.NEVER;
  }
  return phone;
});

/** Fields shared by the form and the Excel import (everything except the site reference). */
export const workerFieldsSchema = z.object({
  name: requiredText(120, 2),
  nameAr: optionalText(120),
  iqamaNumber: iqamaSchema,
  nationality: optionalText(60),
  jobTitle: optionalText(80),
  phone: workerPhone,
  basicSalary: sarAmount,
  housingAllowance: sarAmount,
  transportAllowance: sarAmount,
  otherAllowance: sarAmount,
  iqamaExpiry: optionalDate,
  passportNumber: passportSchema,
  passportExpiry: optionalDate,
});

export const workerCreateSchema = workerFieldsSchema.extend({
  siteId: optionalText(40),
});

/** On edit, an empty Iqama or passport field keeps the stored number (it is never sent back to the browser). */
export const workerUpdateSchema = workerCreateSchema.extend({
  iqamaNumber: z
    .string()
    .optional()
    .transform((v) => (v ? digitsOnly(v) : ""))
    .refine((v) => v === "" || isValidIqama(v), { error: "invalidIqama" })
    .transform((v) => (v === "" ? undefined : v)),
  clearPassport: z.string().optional().transform((v) => v === "on"),
});

export type WorkerFields = z.infer<typeof workerFieldsSchema>;
export type WorkerCreateInput = z.infer<typeof workerCreateSchema>;
export type WorkerUpdateInput = z.infer<typeof workerUpdateSchema>;
