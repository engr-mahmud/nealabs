import { z } from "zod";
import { optionalText, sarAmount } from "@/lib/schema-helpers";
import { toAsciiDigits } from "@/lib/validators";
import { parsePercent } from "@/features/sales/totals";
import { payrollConfig } from "@/config/payroll";
import { parseDateInput } from "@/lib/parse";

/** "1.5" / "0" / "" / "٢" → thousandths (empty = 0). Null if not a number ≥ 0 with at most 3 decimals. */
export function parseThousandths(raw: string | null | undefined): number | null {
  const v = toAsciiDigits(raw ?? "")
    .trim()
    .replace(/[,\s٬]/g, "")
    .replace("٫", ".");
  if (v === "") return 0;
  const m = /^(\d{1,6})(?:\.(\d{1,3}))?$/.exec(v);
  if (!m) return null;
  return Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
}

const thousandths = (max: number, code: string) =>
  z
    .string()
    .max(20, { error: code })
    .optional()
    .transform((v, ctx) => {
      const n = parseThousandths(v);
      if (n === null || n > max) {
        ctx.addIssue({ code: "custom", message: code });
        return z.NEVER;
      }
      return n;
    });

export const absentDaysSchema = thousandths(31_000, "invalidDays");
export const overtimeHoursSchema = thousandths(payrollConfig.maxOvertimeHours * 1000, "invalidHours");

/** The inputs of one worker's line, from the sheet page or a timesheet row. */
export const lineInputSchema = z.object({
  absentDays: absentDaysSchema,
  overtimeHours: overtimeHoursSchema,
  additions: sarAmount,
  advances: sarAmount,
  deductions: sarAmount,
  notes: optionalText(300),
});
export type LineInput = z.infer<typeof lineInputSchema>;

const payBase = z.enum(["BASIC", "GROSS"], { error: "invalid" });

export const settingsSchema = z.object({
  overtimeBase: payBase,
  overtimePremium: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const bp = parsePercent(v || "0");
      if (bp === null) {
        ctx.addIssue({ code: "custom", message: "invalidPercent" });
        return z.NEVER;
      }
      return bp;
    }),
  hoursPerDay: z.coerce.number({ error: "invalid" }).int({ error: "invalid" }).min(1, { error: "invalid" }).max(24, { error: "invalid" }),
  monthDays: z.coerce
    .number({ error: "invalid" })
    .int({ error: "invalid" })
    .refine((v) => v === 0 || (v >= 20 && v <= 31), { error: "invalid" }),
  absenceBase: payBase,
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export const periodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, { error: "invalidMonth" })
  .transform((v) => ({ year: Number(v.slice(0, 4)), month: Number(v.slice(5, 7)) }))
  .refine((p) => p.month >= 1 && p.month <= 12 && p.year >= payrollConfig.minYear && p.year <= 2200, { error: "invalidMonth" });

export const approveSchema = z.object({
  payDate: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const d = parseDateInput(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: "invalidDate" });
        return z.NEVER;
      }
      return d;
    }),
});

export const notesSchema = z.object({ notes: optionalText(500) });
