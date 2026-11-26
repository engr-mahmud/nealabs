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
    case "ACTIVE":
    case "CANCELED": {
      // A canceled subscription keeps working until the paid period ends.
      if (sub.currentPeriodEnd && t < sub.currentPeriodEnd.getTime()) {
        return { state: "active", readOnly: false, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
      }
      return { state: "expired", readOnly: true, trialDaysLeft: null, endsAt: sub.currentPeriodEnd };
    }
    case "PAST_DUE": {
      const graceEnd = sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * DAY_MS : 0;
      if (t < graceEnd) {
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
