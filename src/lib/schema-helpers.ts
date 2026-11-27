import { z } from "zod";
import { toAsciiDigits } from "@/lib/validators";

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
