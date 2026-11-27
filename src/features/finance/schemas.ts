import { z } from "zod";
import { optionalDate, optionalText, requiredText, sarAmount } from "@/lib/schema-helpers";

// Messages are translation keys under "validation".

const optionalId = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => v || null);

export const financeKinds = ["INCOME", "EXPENSE"] as const;
export type FinanceKindValue = (typeof financeKinds)[number];

export const paymentMethods = ["BANK_TRANSFER", "CASH", "CHEQUE", "CARD", "OTHER"] as const;

export const entrySchema = z.object({
  kind: z.enum(financeKinds, { error: "invalid" }),
  categoryId: z.string({ error: "chooseCategory" }).trim().min(1, { error: "chooseCategory" }).max(40),
  date: optionalDate,
  amount: sarAmount.refine((v) => v > 0, { error: "invalidAmount" }),
  /** Checkbox: the amount includes 15% VAT. */
  includesVat: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "1"),
  method: z
    .enum(paymentMethods)
    .optional()
    .catch(undefined)
    .transform((v) => v ?? null),
  siteId: optionalId,
  description: optionalText(300),
  reference: optionalText(100),
});

export type EntryInput = z.infer<typeof entrySchema>;

export const categorySchema = z.object({
  kind: z.enum(financeKinds, { error: "invalid" }),
  nameEn: requiredText(80),
  nameAr: optionalText(80),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const voidSchema = z.object({ reason: optionalText(300) });

export const refundSchema = z.object({
  amount: sarAmount.refine((v) => v > 0, { error: "invalidAmount" }),
  date: optionalDate,
  method: z.enum(paymentMethods).catch("BANK_TRANSFER"),
  reference: optionalText(100),
});

export type RefundInput = z.infer<typeof refundSchema>;
