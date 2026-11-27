import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Set before env() is first read (it is read lazily and cached).
process.env.PAYMENT_GATEWAY = "test";
process.env.MOYASAR_SECRET_KEY = "sk_test_unit";
process.env.MOYASAR_WEBHOOK_SECRET = "webhook-secret-for-tests";

import { prisma, systemDb, tenantDb } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { PLANS, priceFor } from "@/config/plans";
import { softwareSeller } from "@/config/seller";
import { computeAccess, currentPlan } from "@/features/billing/access";
import { addMonths, checkoutAmounts, nextPeriodStart, renewalOpensAt } from "@/features/billing/pricing";
import { mapInvoice } from "@/features/billing/gateway/moyasar";
import {
  applyGatewayState,
  getBillingOverview,
  getSubscriptionInvoice,
  simulateTestPayment,
  startCheckout,
  suggestedPlan,
} from "@/features/billing/service";
import { runBillingJobs } from "@/features/billing/jobs";
import { handleMoyasarWebhook } from "@/features/billing/webhook";
import { renderSubscriptionInvoiceHtml } from "@/features/billing/invoice-html";
import { loadOrgContext, type OrgContext } from "@/features/organizations/context";
import { decodeZatcaQr } from "@/features/sales/zatca-qr";
import { addMember, createOwnerWithOrg, resetDb } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-03-01T09:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * DAY);

async function ctxAt(ctx: OrgContext, now: Date) {
  return (await loadOrgContext(ctx.userId, ctx.organizationId, now)) as OrgContext;
}

async function pay(ctx: OrgContext, plan: "STARTER" | "PRO" | "BUSINESS", cycle: "MONTHLY" | "QUARTERLY" | "YEARLY", now: Date) {
  const c = await ctxAt(ctx, now);
  const { checkoutId } = await startCheckout(c, plan, cycle, now);
  await simulateTestPayment(c, checkoutId, "paid", now);
  return checkoutId;
}

describe("subscription pricing", () => {
  it("adds 15% VAT on the cycle price (yearly = 10 x monthly)", () => {
    for (const plan of PLANS) {
      const yearly = checkoutAmounts(plan.code, "YEARLY");
      expect(yearly.subtotal).toBe(plan.monthlyPriceHalalas * 10);
      expect(yearly.vatAmount).toBe(Math.round(yearly.subtotal * 0.15));
      expect(yearly.total).toBe(yearly.subtotal + yearly.vatAmount);
      expect(yearly.freeMonths).toBe(2);
      expect(yearly.savedHalalas).toBe(priceFor(plan.code, "YEARLY").savedHalalas);
      expect(checkoutAmounts(plan.code, "QUARTERLY").subtotal).toBe(plan.monthlyPriceHalalas * 3);
    }
  });

  it("adds calendar months and clamps the day", () => {
    expect(addMonths(new Date("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonths(new Date("2026-11-15T00:00:00Z"), 3).toISOString()).toBe("2027-02-15T00:00:00.000Z");
    expect(addMonths(new Date("2028-02-29T00:00:00Z"), 12).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });

  it("starts a paid period after the trial or the current period, never with a gap", () => {
    expect(nextPeriodStart({ status: "TRIALING", trialEndsAt: at(5), currentPeriodEnd: null }, T0)).toEqual(at(5));
    expect(nextPeriodStart({ status: "TRIALING", trialEndsAt: at(-1), currentPeriodEnd: null }, T0)).toEqual(T0);
    expect(nextPeriodStart({ status: "ACTIVE", trialEndsAt: at(-40), currentPeriodEnd: at(10) }, T0)).toEqual(at(10));
    expect(nextPeriodStart({ status: "PAST_DUE", trialEndsAt: at(-40), currentPeriodEnd: at(-1) }, T0)).toEqual(at(-1));
    expect(nextPeriodStart({ status: "EXPIRED", trialEndsAt: at(-40), currentPeriodEnd: at(-20) }, T0)).toEqual(T0);
    expect(nextPeriodStart(null, T0)).toEqual(T0);
  });

  it("opens renewal 14 days before a paid period ends", () => {
    const sub = { status: "ACTIVE" as const, trialEndsAt: at(-40), currentPeriodEnd: at(20) };
    expect(renewalOpensAt(sub, T0)).toEqual(at(6));
    expect(renewalOpensAt(sub, at(6))).toBeNull();
    expect(renewalOpensAt({ ...sub, status: "TRIALING" }, T0)).toBeNull();
  });

  it("suggests the smallest plan that fits current usage", () => {
    expect(suggestedPlan({ workers: 10, invoicesThisMonth: 5 }, PLANS)).toBe("STARTER");
    expect(suggestedPlan({ workers: 60, invoicesThisMonth: 5 }, PLANS)).toBe("PRO");
    expect(suggestedPlan({ workers: 5000, invoicesThisMonth: 5 }, PLANS)).toBe("BUSINESS");
  });

  it("applies a scheduled plan only from its start date", () => {
    const sub = { planCode: "STARTER", billingCycle: "MONTHLY" as const, scheduledPlanCode: "PRO", scheduledCycle: "YEARLY" as const, scheduledFrom: at(10) };
    expect(currentPlan(sub, T0)).toMatchObject({ planCode: "STARTER", scheduled: { planCode: "PRO" } });
    expect(currentPlan(sub, at(10))).toMatchObject({ planCode: "PRO", billingCycle: "YEARLY", scheduled: null });
  });
});

describe("Moyasar invoice mapping", () => {
  it("reads paid, pending and expired invoices", () => {
    const paid = mapInvoice({ id: "inv_1", status: "paid", amount: 22885, currency: "SAR", payments: [{ id: "pay_f", status: "failed", amount: 22885, message: "Declined" }, { id: "pay_1", status: "paid", amount: 22885, live: false }] });
    expect(paid).toMatchObject({ status: "paid", amount: 22885, paymentId: "pay_1", live: false, failureReason: null });
    expect(mapInvoice({ id: "inv_2", status: "initiated", amount: 100, currency: "sar", payments: [{ id: "p", status: "failed", amount: 100, message: "Insufficient funds" }] })).toMatchObject({
      status: "pending",
      currency: "SAR",
      failureReason: "Insufficient funds",
    });
    expect(mapInvoice({ id: "inv_3", status: "expired", amount: 100, currency: "SAR" }).status).toBe("expired");
  });
});

describe("checkout and payment", () => {
  beforeEach(resetDb);

  it("paying during the trial starts the plan when the trial ends and issues a tax invoice with QR", async () => {
    const { ctx, org } = await createOwnerWithOrg("Payco", T0);
    await prisma.organization.update({ where: { id: org.id }, data: { vatNumber: "311111111100003", nameAr: "شركة الدفع" } });
    const now = at(2);
    await pay(ctx, "PRO", "YEARLY", now);

    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub).toMatchObject({ status: "ACTIVE", planCode: "PRO", billingCycle: "YEARLY" });
    expect(sub.currentPeriodStart).toEqual(at(7));
    expect(sub.currentPeriodEnd).toEqual(addMonths(at(7), 12));
    expect(computeAccess(sub, now)).toMatchObject({ state: "active", readOnly: false });

    const overview = await getBillingOverview(await ctxAt(ctx, now), now);
    expect(overview.invoices).toHaveLength(1);
    const invoice = await getSubscriptionInvoice(ctx, overview.invoices[0]!.id);
    const amounts = checkoutAmounts("PRO", "YEARLY");
    expect(invoice).toMatchObject({ number: "SUB-00001", subtotal: amounts.subtotal, vatAmount: amounts.vatAmount, total: amounts.total, planCode: "PRO" });
    expect(invoice.buyer).toMatchObject({ nameEn: "Payco", vatNumber: "311111111100003" });
    const qr = decodeZatcaQr(invoice.qrPayload);
    expect(qr[1]).toBe(softwareSeller.legalNameAr);
    expect(qr[2]).toBe(softwareSeller.vatNumber);
    expect(qr[3]).toBe("2026-03-03T09:00:00Z");
    expect(qr[4]).toBe(`${Math.trunc(amounts.total / 100)}.${String(amounts.total % 100).padStart(2, "0")}`);

    const html = await renderSubscriptionInvoiceHtml(invoice, { lang: "ar", forPdf: false });
    expect(html).toContain("فاتورة ضريبية");
    expect(html).toContain("SUB-00001");
  });

  it("is idempotent: a repeated gateway notification never pays twice", async () => {
    const { ctx, org } = await createOwnerWithOrg("Twice", T0);
    const c = await ctxAt(ctx, at(1));
    const { checkoutId } = await startCheckout(c, "STARTER", "MONTHLY", at(1));
    const checkout = await tenantDb(org.id).billingCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
    const state = { status: "paid" as const, amount: checkout.total, currency: "SAR", paymentId: "p1", failureReason: null, live: false };
    const results = await Promise.all([applyGatewayState(checkoutId, state, at(1)), applyGatewayState(checkoutId, state, at(1))]);
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await systemDb().subscriptionInvoice.count()).toBe(1);
    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub.currentPeriodEnd).toEqual(addMonths(at(7), 1));
  });

  it("refuses a payment whose amount does not match the checkout", async () => {
    const { ctx, org } = await createOwnerWithOrg("Mismatch", T0);
    const { checkoutId } = await startCheckout(await ctxAt(ctx, at(1)), "PRO", "MONTHLY", at(1));
    const r = await applyGatewayState(checkoutId, { status: "paid", amount: 100, currency: "SAR", paymentId: "x", failureReason: null, live: false }, at(1));
    expect(r).toEqual({ applied: false, reason: "amountMismatch" });
    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub.status).toBe("TRIALING");
    expect(await systemDb().subscriptionInvoice.count()).toBe(0);
  });

  it("a declined test payment changes nothing", async () => {
    const { ctx, org } = await createOwnerWithOrg("Declined", T0);
    const c = await ctxAt(ctx, at(1));
    const { checkoutId } = await startCheckout(c, "PRO", "MONTHLY", at(1));
    await simulateTestPayment(c, checkoutId, "failed", at(1));
    const checkout = await tenantDb(org.id).billingCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
    expect(checkout.status).toBe("FAILED");
    expect((await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).status).toBe("TRIALING");
  });

  it("only the owner can pay", async () => {
    const { org } = await createOwnerWithOrg("Roles", T0);
    const { ctx: accountant } = await addMember(org.id, "ACCOUNTANT");
    await expect(startCheckout(await ctxAt(accountant, at(1)), "PRO", "MONTHLY", at(1))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a read-only company can subscribe again and becomes writable at once", async () => {
    const { ctx, org } = await createOwnerWithOrg("Lapsed", T0);
    const late = at(30);
    expect((await ctxAt(ctx, late)).access.readOnly).toBe(true);
    await pay(ctx, "STARTER", "QUARTERLY", late);
    const after = await ctxAt(ctx, late);
    expect(after.access).toMatchObject({ state: "active", readOnly: false });
    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub.currentPeriodStart).toEqual(late);
    expect(sub.currentPeriodEnd).toEqual(addMonths(late, 3));
  });

  it("renewal is refused until 14 days before the period ends; a plan change waits for the next period", async () => {
    const { ctx, org } = await createOwnerWithOrg("Renew", T0);
    await pay(ctx, "STARTER", "MONTHLY", at(8)); // trial over: period at(8) → +1 month
    const sub0 = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    const end = sub0.currentPeriodEnd!;
    await expect(startCheckout(await ctxAt(ctx, at(9)), "PRO", "MONTHLY", at(9))).rejects.toMatchObject({ code: "renewTooEarly" });

    const renewDay = new Date(end.getTime() - 5 * DAY);
    await pay(ctx, "PRO", "YEARLY", renewDay);
    const sub = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(sub).toMatchObject({ planCode: "STARTER", scheduledPlanCode: "PRO", scheduledCycle: "YEARLY" });
    expect(sub.scheduledFrom).toEqual(end);
    expect(sub.currentPeriodEnd).toEqual(addMonths(end, 12));
    expect(currentPlan(sub, renewDay).planCode).toBe("STARTER");
    expect(currentPlan(sub, end).planCode).toBe("PRO");

    // The daily job stores the rollover once the new period starts.
    await runBillingJobs(new Date(end.getTime() + DAY));
    const rolled = await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } });
    expect(rolled).toMatchObject({ planCode: "PRO", billingCycle: "YEARLY", scheduledPlanCode: null, status: "ACTIVE" });
  });

  it("subscription invoices are isolated per company", async () => {
    const a = await createOwnerWithOrg("Alpha", T0);
    const b = await createOwnerWithOrg("Beta", T0);
    await pay(a.ctx, "PRO", "MONTHLY", at(1));
    const [inv] = await systemDb().subscriptionInvoice.findMany();
    await expect(getSubscriptionInvoice(b.ctx, inv!.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await tenantDb(b.org.id).subscriptionInvoice.count()).toBe(0);
    expect(await tenantDb(b.org.id).billingCheckout.count()).toBe(0);
    expect(await tenantDb(a.org.id).billingCheckout.count()).toBe(1);
  });

  it("numbers invoices without gaps across companies", async () => {
    const a = await createOwnerWithOrg("One", T0);
    const b = await createOwnerWithOrg("Two", T0);
    await pay(a.ctx, "STARTER", "MONTHLY", at(1));
    await pay(b.ctx, "STARTER", "MONTHLY", at(1));
    const numbers = (await systemDb().subscriptionInvoice.findMany({ orderBy: { number: "asc" } })).map((i) => i.number);
    expect(numbers).toEqual(["SUB-00001", "SUB-00002"]);
  });
});

describe("Moyasar webhook", () => {
  beforeEach(resetDb);
  afterEach(() => vi.unstubAllGlobals());

  async function moyasarCheckout() {
    const { ctx, org } = await createOwnerWithOrg("Hooked", T0);
    const amounts = checkoutAmounts("PRO", "MONTHLY");
    const checkout = await tenantDb(org.id).billingCheckout.create({
      data: { organizationId: org.id, createdById: ctx.userId, planCode: "PRO", billingCycle: "MONTHLY", subtotal: amounts.subtotal, vatRate: amounts.vatRate, vatAmount: amounts.vatAmount, total: amounts.total, gateway: "moyasar", gatewayRef: "inv_hook" },
    });
    return { org, checkout };
  }

  it("rejects a wrong secret token", async () => {
    const r = await handleMoyasarWebhook(JSON.stringify({ type: "payment_paid", secret_token: "nope", data: { invoice_id: "inv_hook" } }));
    expect(r.status).toBe(401);
    expect((await handleMoyasarWebhook("not json")).status).toBe(400);
  });

  it("confirms the payment with Moyasar before activating, and never trusts the body", async () => {
    const { org, checkout } = await moyasarCheckout();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "inv_hook", status: "paid", amount: checkout.total, currency: "SAR", payments: [{ id: "pay_9", status: "paid", amount: checkout.total, live: false }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await handleMoyasarWebhook(JSON.stringify({ type: "payment_paid", secret_token: "webhook-secret-for-tests", data: { id: "pay_9", invoice_id: "inv_hook", amount: 1 } }));
    expect(r).toEqual({ status: 200, body: "applied" });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toMatch(/\/invoices\/inv_hook$/);
    const paid = await tenantDb(org.id).billingCheckout.findUniqueOrThrow({ where: { id: checkout.id } });
    expect(paid).toMatchObject({ status: "PAID", gatewayPaymentId: "pay_9" });
  });

  it("asks Moyasar to retry when the gateway cannot be reached", async () => {
    await moyasarCheckout();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const r = await handleMoyasarWebhook(JSON.stringify({ type: "payment_paid", secret_token: "webhook-secret-for-tests", data: { invoice_id: "inv_hook" } }));
    expect(r.status).toBe(500);
  });

  it("ignores unknown invoices and non-payment events", async () => {
    const ok = (body: object) => handleMoyasarWebhook(JSON.stringify({ secret_token: "webhook-secret-for-tests", ...body }));
    expect(await ok({ type: "payment_paid", data: { invoice_id: "inv_unknown" } })).toEqual({ status: 200, body: "unknown" });
    expect(await ok({ type: "card_auth_failed", data: {} })).toEqual({ status: 200, body: "ignored" });
  });
});

describe("daily billing job", () => {
  beforeEach(resetDb);

  it("moves unpaid periods to past due, then read-only, and expires ended trials", async () => {
    const paid = await createOwnerWithOrg("Paid", T0);
    await pay(paid.ctx, "STARTER", "MONTHLY", at(8));
    const trial = await createOwnerWithOrg("Trial", T0);
    const end = (await tenantDb(paid.org.id).subscription.findUniqueOrThrow({ where: { organizationId: paid.org.id } })).currentPeriodEnd!;

    await runBillingJobs(new Date(end.getTime() + DAY));
    expect((await tenantDb(paid.org.id).subscription.findUniqueOrThrow({ where: { organizationId: paid.org.id } })).status).toBe("PAST_DUE");
    expect((await tenantDb(trial.org.id).subscription.findUniqueOrThrow({ where: { organizationId: trial.org.id } })).status).toBe("EXPIRED");
    expect((await ctxAt(paid.ctx, new Date(end.getTime() + DAY))).access).toMatchObject({ state: "past_due", readOnly: false });

    await runBillingJobs(new Date(end.getTime() + 4 * DAY));
    const sub = await tenantDb(paid.org.id).subscription.findUniqueOrThrow({ where: { organizationId: paid.org.id } });
    expect(sub.status).toBe("EXPIRED");
    expect((await ctxAt(paid.ctx, new Date(end.getTime() + 4 * DAY))).access.readOnly).toBe(true);
    // Data is never deleted.
    expect(await tenantDb(paid.org.id).subscriptionInvoice.count()).toBe(1);
  });

  it("sends renewal reminders 7 and 1 days before the end, once per day", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { ctx, org } = await createOwnerWithOrg("Remind", T0);
    await pay(ctx, "PRO", "MONTHLY", at(8));
    const end = (await tenantDb(org.id).subscription.findUniqueOrThrow({ where: { organizationId: org.id } })).currentPeriodEnd!;

    const sevenBefore = new Date(end.getTime() - 7 * DAY + 60_000);
    expect((await runBillingJobs(sevenBefore)).reminders).toBe(1);
    expect((await runBillingJobs(sevenBefore)).reminders).toBe(0);
    expect((await runBillingJobs(new Date(end.getTime() - 3 * DAY))).reminders).toBe(0);
    expect((await runBillingJobs(new Date(end.getTime() - DAY + 60_000))).reminders).toBe(1);
    const sent = info.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("[email]"));
    expect(sent.some((s) => s.includes("renews in 7 days") || s.includes("7 days"))).toBe(true);
    info.mockRestore();
  });

  it("closes checkouts left unpaid for 48 hours", async () => {
    const { ctx, org } = await createOwnerWithOrg("Stale", T0);
    await startCheckout(await ctxAt(ctx, at(1)), "PRO", "MONTHLY");
    const r = await runBillingJobs(new Date(Date.now() + 3 * DAY));
    expect(r.expiredCheckouts).toBe(1);
    expect((await tenantDb(org.id).billingCheckout.findFirstOrThrow()).status).toBe("EXPIRED");
  });
});
