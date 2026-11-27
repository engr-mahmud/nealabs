import { z } from "zod";
import { salesConfig } from "@/config/sales";
import { parseSarToHalalas } from "@/lib/parse";
import { optionalDate, optionalText, requiredText, sarAmount } from "@/lib/schema-helpers";
import { parsePercent, parseQuantity } from "./totals";

// Messages are translation keys under "validation".

const quantity = z
  .string()
  .trim()
  .max(20, { error: "invalidQuantity" })
  .transform((v, ctx) => {
    const q = parseQuantity(v);
    if (q === null) {
      ctx.addIssue({ code: "custom", message: "invalidQuantity" });
      return z.NEVER;
    }
    return q;
  });

const unitPrice = z
  .string()
  .trim()
  .max(20, { error: "invalidAmount" })
  .transform((v, ctx) => {
    const h = parseSarToHalalas(v);
    if (h === null) {
      ctx.addIssue({ code: "custom", message: "invalidAmount" });
      return z.NEVER;
    }
    return h;
  });

export const lineSchema = z.object({
  description: requiredText(300),
  descriptionAr: optionalText(300),
  quantity,
  unitPrice,
});

export const linesSchema = z.array(lineSchema).min(1, { error: "addLine" }).max(salesConfig.maxLines, { error: "tooManyLines" });

/** Lines arrive as one JSON field from the line editor. */
export function parseLinesJson(raw: unknown): unknown {
  if (typeof raw !== "string" || raw.length > 200_000) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const salesDocSchema = z
  .object({
    clientId: z.string().trim().min(1, { error: "chooseClient" }).max(40),
    siteId: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => v || null),
    issueDate: optionalDate,
    dueDate: optionalDate,
    discountType: z.enum(["NONE", "PERCENT", "AMOUNT"]).catch("NONE"),
    discountValue: z.string().trim().max(20).optional(),
    notes: optionalText(2000),
    terms: optionalText(2000),
  })
  .transform((v, ctx) => {
    let discountValue = 0;
    if (v.discountType === "PERCENT") {
      const bp = parsePercent(v.discountValue ?? "");
      if (bp === null) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "invalidPercent" });
      else discountValue = bp;
    } else if (v.discountType === "AMOUNT") {
      const h = parseSarToHalalas(v.discountValue ?? "");
      if (h === null) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "invalidAmount" });
      else discountValue = h;
    }
    if (v.issueDate && v.dueDate && v.dueDate < v.issueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "dueBeforeIssue" });
    }
    return { ...v, discountType: discountValue === 0 ? ("NONE" as const) : v.discountType, discountValue };
  });

export type SalesDocFields = z.infer<typeof salesDocSchema>;
export type LineFields = z.infer<typeof lineSchema>;
export type SalesDocInput = SalesDocFields & { lines: LineFields[] };

export const paymentSchema = z.object({
  amount: sarAmount.refine((v) => v > 0, { error: "invalidAmount" }),
  paidOn: optionalDate.refine((v) => v !== null, { error: "required" }),
  method: z.enum(["BANK_TRANSFER", "CASH", "CHEQUE", "CARD", "OTHER"]).catch("BANK_TRANSFER"),
  reference: optionalText(100),
  note: optionalText(500),
});

export type PaymentInput = { amount: number; paidOn: Date; method: z.infer<typeof paymentSchema>["method"]; reference?: string | null; note?: string | null };
