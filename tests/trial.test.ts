import { beforeEach, describe, expect, it } from "vitest";
import { prisma, tenantDb } from "@/lib/db";
import { ReadOnlyError } from "@/lib/errors";
import { computeAccess, PAST_DUE_GRACE_DAYS } from "@/features/billing/access";
import { assertCan, loadOrgContext } from "@/features/organizations/context";
import { createInvitation, exportOrganizationData, updateOrganization } from "@/features/organizations/service";
import { createOwnerWithOrg, resetDb } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const start = new Date("2026-01-01T09:00:00Z");
const at = (days: number) => new Date(start.getTime() + days * DAY);
const trial = { status: "TRIALING" as const, trialEndsAt: at(7), currentPeriodEnd: null };

describe("computeAccess", () => {
  it("a new trial has 7 days left and is writable", () => {
    expect(computeAccess(trial, start)).toMatchObject({ state: "trialing", readOnly: false, trialDaysLeft: 7 });
  });

  it("counts partial days as a full day left", () => {
    expect(computeAccess(trial, at(6.5)).trialDaysLeft).toBe(1);
  });

  it("becomes read-only exactly when the trial ends", () => {
    expect(computeAccess(trial, new Date(at(7).getTime() - 1)).readOnly).toBe(false);
    expect(computeAccess(trial, at(7))).toMatchObject({ state: "expired", readOnly: true });
    expect(computeAccess(trial, at(30))).toMatchObject({ state: "expired", readOnly: true });
  });

  it("active subscriptions are writable until the period ends", () => {
    const sub = { status: "ACTIVE" as const, trialEndsAt: at(7), currentPeriodEnd: at(37) };
    expect(computeAccess(sub, at(20))).toMatchObject({ state: "active", readOnly: false });
    expect(computeAccess(sub, at(37))).toMatchObject({ state: "expired", readOnly: true });
  });

  it("canceled subscriptions keep working until the paid period ends", () => {
    const sub = { status: "CANCELED" as const, trialEndsAt: at(7), currentPeriodEnd: at(37) };
    expect(computeAccess(sub, at(36)).readOnly).toBe(false);
    expect(computeAccess(sub, at(38)).readOnly).toBe(true);
  });

  it("past due has a short grace period, then read-only", () => {
    const sub = { status: "PAST_DUE" as const, trialEndsAt: at(7), currentPeriodEnd: at(37) };
    expect(computeAccess(sub, at(37 + PAST_DUE_GRACE_DAYS - 0.5))).toMatchObject({ state: "past_due", readOnly: false });
    expect(computeAccess(sub, at(37 + PAST_DUE_GRACE_DAYS))).toMatchObject({ state: "expired", readOnly: true });
  });

  it("expired or missing subscriptions are read-only", () => {
    expect(computeAccess({ status: "EXPIRED", trialEndsAt: at(7), currentPeriodEnd: null }, start).readOnly).toBe(true);
    expect(computeAccess(null, start).readOnly).toBe(true);
  });
});

describe("trial lifecycle", () => {
  beforeEach(resetDb);

  it("a new organization starts a 7-day trial without a card", async () => {
    const now = new Date();
    const { org, ctx } = await createOwnerWithOrg("Fresh", now);
    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub.status).toBe("TRIALING");
    expect(sub.trialEndsAt.getTime() - now.getTime()).toBe(7 * DAY);
    expect(ctx.access).toMatchObject({ state: "trialing", readOnly: false, trialDaysLeft: 7 });
  });

  it("after the trial the organization is read-only, data stays, export still works", async () => {
    const { user, org } = await createOwnerWithOrg("Expired", new Date(Date.now() - 8 * DAY));
    const ctx = await loadOrgContext(user.id, org.id);
    expect(ctx?.access).toMatchObject({ state: "expired", readOnly: true });

    await expect(updateOrganization(ctx!, { nameEn: "Changed" })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(createInvitation(ctx!, { email: "a@example.com", role: "ACCOUNTANT" })).rejects.toBeInstanceOf(ReadOnlyError);

    // Never deleted: the organization and its data are untouched.
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).nameEn).toBe("Expired");
    const exported = await exportOrganizationData(ctx!);
    expect(exported.organization.id).toBe(org.id);

    // The owner can still reach billing to subscribe again.
    expect(() => assertCan(ctx!, "billing.manage")).not.toThrow();
    expect(() => assertCan(ctx!, "data.write")).toThrow(ReadOnlyError);
  });

  it("subscribing again makes the organization writable", async () => {
    const { user, org } = await createOwnerWithOrg("Back", new Date(Date.now() - 8 * DAY));
    await tenantDb(org.id).subscription.update({
      where: { organizationId: org.id },
      data: { status: "ACTIVE", planCode: "PRO", billingCycle: "MONTHLY", currentPeriodEnd: new Date(Date.now() + 30 * DAY) },
    });
    const ctx = await loadOrgContext(user.id, org.id);
    expect(ctx?.access.readOnly).toBe(false);
    await updateOrganization(ctx!, { nameEn: "Back Again" });
  });
});
