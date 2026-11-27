import type { SubscriptionStatus } from "@/generated/prisma/enums";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a past_due subscription stays writable after its period ends. */
export const PAST_DUE_GRACE_DAYS = 3;

export type AccessState = "trialing" | "active" | "past_due" | "expired";

export interface OrgAccess {
  state: AccessState;
  /** When true, the organization can view and export data but not change it. */
  readOnly: boolean;
  /** Whole days left in the trial (only when trialing). */
  trialDaysLeft: number | null;
  /** When the current trial or paid period ends. */
  endsAt: Date | null;
}

export interface SubscriptionLike {
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
}

/**
 * Derives access from the subscription and the clock, so an organization
 * turns read-only the moment its trial or period ends, even if no background
 * job or webhook has run yet. Data is never deleted.
 */
export function computeAccess(sub: SubscriptionLike | null, now: Date = new Date()): OrgAccess {
  if (!sub) return { state: "expired", readOnly: true, trialDaysLeft: null, endsAt: null };
  const t = now.getTime();

  switch (sub.status) {
    case "TRIALING": {
      const end = sub.trialEndsAt.getTime();
      if (t < end) {
        return { state: "trialing", readOnly: false, trialDaysLeft: Math.ceil((end - t) / DAY_MS), endsAt: sub.trialEndsAt };
      }
      return { state: "expired", readOnly: true, trialDaysLeft: 0, endsAt: sub.trialEndsAt };
    }
    case "CANCELED": {
      // A canceled subscription keeps working until the paid period ends, with no grace.
      if (sub.currentPeriodEnd && t < sub.currentPeriodEnd.getTime()) {
        return { state: "active", readOnly: false, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
      }
      return { state: "expired", readOnly: true, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
    }
    case "ACTIVE":
    case "PAST_DUE": {
      // Renewals are paid by the owner (no automatic charge). When a period ends unpaid,
      // the company keeps working for a short grace period, then turns read-only. This
      // holds even before the daily job has moved the stored status to PAST_DUE.
      const end = sub.currentPeriodEnd?.getTime() ?? 0;
      if (sub.status === "ACTIVE" && t < end) {
        return { state: "active", readOnly: false, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
      }
      const graceEnd = end + PAST_DUE_GRACE_DAYS * DAY_MS;
      if (end > 0 && t < graceEnd) {
        return { state: "past_due", readOnly: false, trialDaysLeft: null, endsAt: new Date(graceEnd) };
      }
      return { state: "expired", readOnly: true, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
    }
    case "EXPIRED":
      return { state: "expired", readOnly: true, trialDaysLeft: null, endsAt: sub.currentPeriodEnd ?? sub.trialEndsAt };
  }
}

export function trialEndDate(start: Date, trialDays: number): Date {
  return new Date(start.getTime() + trialDays * DAY_MS);
}

export interface ScheduledPlanLike {
  planCode: string | null;
  billingCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  scheduledPlanCode: string | null;
  scheduledCycle: "MONTHLY" | "QUARTERLY" | "YEARLY" | null;
  scheduledFrom: Date | null;
}

/** The plan in force now: a renewal paid early with another plan applies from scheduledFrom. */
export function currentPlan(sub: ScheduledPlanLike, now: Date = new Date()) {
  if (sub.scheduledPlanCode && sub.scheduledFrom && now.getTime() >= sub.scheduledFrom.getTime()) {
    return { planCode: sub.scheduledPlanCode, billingCycle: sub.scheduledCycle, scheduled: null };
  }
  const scheduled = sub.scheduledPlanCode && sub.scheduledFrom ? { planCode: sub.scheduledPlanCode, billingCycle: sub.scheduledCycle, from: sub.scheduledFrom } : null;
  return { planCode: sub.planCode, billingCycle: sub.billingCycle, scheduled };
}
