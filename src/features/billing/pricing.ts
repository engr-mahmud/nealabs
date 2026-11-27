import { billingConfig, CYCLE_MONTHS, priceFor, type BillingCycleCode, type PlanCode } from "@/config/plans";
import { mulDivRound } from "@/features/sales/totals";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { PAST_DUE_GRACE_DAYS } from "./access";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CheckoutAmounts {
  /** Cycle price excluding VAT, halalas. */
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  /** Months covered and months not charged (yearly: 12 covered, 2 free). */
  months: number;
  freeMonths: number;
  savedHalalas: number;
}

/** Price, VAT (rounded half up on the whole amount) and total for one plan period. */
export function checkoutAmounts(plan: PlanCode, cycle: BillingCycleCode): CheckoutAmounts {
  const price = priceFor(plan, cycle);
  const vatRate = billingConfig.vatRate;
  const vatAmount = mulDivRound(price.totalHalalas, vatRate, 10_000);
  return {
    subtotal: price.totalHalalas,
    vatRate,
    vatAmount,
    total: price.totalHalalas + vatAmount,
    months: price.months,
    freeMonths: price.freeMonths,
    savedHalalas: price.savedHalalas,
  };
}

/** Adds calendar months in UTC, keeping the time; the day is clamped (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = new Date(date);
  d.setUTCFullYear(y, m, Math.min(date.getUTCDate(), lastDay));
  return d;
}

export interface SubscriptionTiming {
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
}

/**
 * When a newly paid period starts:
 * - during the trial: when the trial ends (the customer keeps the remaining free days);
 * - while a paid period is running or in its unpaid grace days: right after the current
 *   period, so periods follow each other without gaps or free days;
 * - otherwise (expired, canceled and ended): now.
 */
export function nextPeriodStart(sub: SubscriptionTiming | null, now: Date): Date {
  if (!sub) return now;
  const t = now.getTime();
  if (sub.status === "TRIALING" && sub.trialEndsAt.getTime() > t) return sub.trialEndsAt;
  if ((sub.status === "ACTIVE" || sub.status === "PAST_DUE") && sub.currentPeriodEnd) {
    const end = sub.currentPeriodEnd.getTime();
    if (t < end + PAST_DUE_GRACE_DAYS * DAY_MS) return sub.currentPeriodEnd;
  }
  if (sub.status === "CANCELED" && sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > t) return sub.currentPeriodEnd;
  return now;
}

export function periodFor(start: Date, cycle: BillingCycleCode) {
  return { start, end: addMonths(start, CYCLE_MONTHS[cycle]) };
}

/**
 * A running paid plan can be renewed only in the last days before it ends, so at most
 * one future period is ever prepaid. Returns the first day renewal is allowed, or null
 * when the customer can pay now.
 */
export function renewalOpensAt(sub: SubscriptionTiming | null, now: Date): Date | null {
  if (!sub || sub.status !== "ACTIVE" || !sub.currentPeriodEnd) return null;
  const opens = new Date(sub.currentPeriodEnd.getTime() - billingConfig.renewWindowDays * DAY_MS);
  return now.getTime() < opens.getTime() ? opens : null;
}
