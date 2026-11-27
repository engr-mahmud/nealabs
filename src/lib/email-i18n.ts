import { createFormatter, createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

/**
 * Translations for emails and background jobs, which run outside a page request
 * (cron, webhooks). Works anywhere, including tests.
 */
export function emailTranslator(locale: Locale, namespace: string) {
  // Namespaces are checked at runtime; the cast keeps call sites simple.
  return createTranslator({ locale, messages: (locale === "ar" ? ar : en) as Record<string, unknown>, namespace } as never) as unknown as (key: string, values?: Record<string, string | number>) => string;
}

export function emailFormatter(locale: Locale) {
  return createFormatter({ locale, timeZone: "Asia/Riyadh" });
}
