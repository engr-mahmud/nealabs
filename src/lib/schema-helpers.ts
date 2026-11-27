import { z } from "zod";
import { toAsciiDigits } from "@/lib/validators";
import { parseDateInput, parseSarToHalalas } from "@/lib/parse";

/** Optional trimmed text: empty becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const requiredText = (max: number, min = 1) => z.string().trim().min(min, { error: "required" }).max(max, { error: "tooLong" });

/** Removes spaces and turns Arabic-Indic digits into ASCII. */
export const digitsOnly = (v: string) => toAsciiDigits(v).replace(/\s+/g, "");

/** Amount in SAR typed by the user, stored as integer halalas. Empty means 0. */
export const sarAmount = z
  .string()
  .trim()
  .max(20, { error: "invalidAmount" })
  .optional()
  .transform((v, ctx) => {
    if (!v) return 0;
    const halalas = parseSarToHalalas(v);
    if (halalas === null) {
      ctx.addIssue({ code: "custom", message: "invalidAmount" });
      return z.NEVER;
    }
    return halalas;
  });

export const optionalDate = z
  .string()
  .trim()
  .max(20, { error: "invalidDate" })
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const date = parseDateInput(v);
    if (!date) {
      ctx.addIssue({ code: "custom", message: "invalidDate" });
      return z.NEVER;
    }
    return date;
  });
