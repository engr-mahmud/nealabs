import { masterDataConfig } from "@/config/master-data";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

/** Today's date in Saudi Arabia as a UTC-midnight Date (document dates are stored the same way). */
export function todayInRiyadh(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${parts}T00:00:00.000Z`);
}

/** Whole days from today until the date (negative when already expired). */
export function daysUntil(date: Date, today: Date): number {
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

export function expiryStatus(date: Date | null | undefined, today: Date): ExpiryStatus {
  if (!date) return "none";
  const days = daysUntil(date, today);
  if (days < 0) return "expired";
  if (days <= masterDataConfig.expiryWarningDays) return "soon";
  return "ok";
}

/** Last day that still counts as "expiring soon". */
export function warningLimit(today: Date): Date {
  return new Date(today.getTime() + masterDataConfig.expiryWarningDays * DAY_MS);
}
