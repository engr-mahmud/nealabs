import { getTranslations } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { AppError, FieldError } from "@/lib/errors";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted text values so forms keep input after an error. */
  values?: Record<string, string>;
}

export function formValues(formData: FormData, omit: string[] = ["password", "confirmPassword"]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !omit.includes(key) && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/** Validates FormData with zod; returns translated field errors on failure. */
export async function parseForm<S extends z.ZodType>(schema: S, formData: FormData) {
  const raw = formValues(formData, []);
  const result = schema.safeParse(raw);
  if (result.success) return { data: result.data as z.infer<S>, error: null };
  const t = await getTranslations("validation");
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= t.has(issue.message) ? t(issue.message) : t("invalid");
  }
  return { data: null, error: { ok: false, fieldErrors, values: formValues(formData) } satisfies ActionState };
}

/**
 * Central error handling for server actions: expected errors become friendly,
 * translated messages; unexpected errors are logged without user input.
 */
export async function actionError(error: unknown, formData?: FormData): Promise<ActionState> {
  unstable_rethrow(error);
  const t = await getTranslations("errors");
  const values = formData ? formValues(formData) : undefined;
  if (error instanceof FieldError) {
    const tv = await getTranslations("validation");
    return { ok: false, fieldErrors: { [error.field]: tv.has(error.code) ? tv(error.code) : t("generic") }, values };
  }
  if (error instanceof AppError) {
    return { ok: false, message: t.has(error.code) ? t(error.code) : t("generic"), values };
  }
  console.error("[action] unexpected error", error instanceof Error ? error.stack : error);
  return { ok: false, message: t("generic"), values };
}
