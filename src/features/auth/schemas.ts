import { z } from "zod";
import { normalizeSaudiMobile } from "@/lib/phone";

// Messages are translation keys under "validation".
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "required" })
  .max(254, { error: "tooLong" })
  .pipe(z.email({ error: "invalidEmail" }));

export const passwordSchema = z
  .string()
  .min(8, { error: "passwordTooShort" })
  .max(128, { error: "tooLong" });

/** Saudi mobile, normalized to +9665XXXXXXXX. */
export const phoneSchema = z
  .string()
  .trim()
  .min(1, { error: "required" })
  .max(25, { error: "invalidPhone" })
  .transform((v, ctx) => {
    const phone = normalizeSaudiMobile(v);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "invalidPhone" });
      return z.NEVER;
    }
    return phone;
  });

export const signUpSchema = z.object({
  name: z.string().trim().min(2, { error: "required" }).max(100, { error: "tooLong" }),
  email: emailSchema,
  phone: phoneSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "required" }).max(128, { error: "tooLong" }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "passwordsDoNotMatch",
  });

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}

export const phoneFormSchema = z.object({ phone: phoneSchema });

export const verifyCodeSchema = z.object({
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 6, { error: "invalidCode" }),
});
