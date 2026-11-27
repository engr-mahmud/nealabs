import "server-only";
import { billingConfig, getPlan, type BillingCycleCode, type PlanCode } from "@/config/plans";
import { softwareSeller } from "@/config/seller";
import type { Prisma } from "@/generated/prisma/client";
import { prisma, systemDb, tenantDb, type TxClient } from "@/lib/db";
import { emailLayout, sendEmail } from "@/lib/email";
import { emailTranslator } from "@/lib/email-i18n";
import { env } from "@/lib/env";
import { AppError, NotFoundError } from "@/lib/errors";
import { isLocale, localeDir } from "@/i18n/config";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { zatcaQrPayload } from "@/features/sales/zatca-qr";
import { formatSar } from "@/lib/money";
import { currentPlan } from "./access";
import { activeGateway, activeGatewayName, gatewayFor } from "./gateway";
import type { GatewayCheckoutState } from "./gateway/types";
import { checkoutAmounts, nextPeriodStart, periodFor, renewalOpensAt } from "./pricing";

const HOUR_MS = 60 * 60 * 1000;

export interface InvoiceParty {
  nameEn: string;
  nameAr: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
}

// ---------------------------------------------------------------- overview

export async function getBillingOverview(ctx: OrgContext, now = new Date()) {
  const db = tenantDb(ctx.organizationId);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [sub, invoices, workers, invoicesThisMonth] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
    db.subscriptionInvoice.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { issuedAt: "desc" },
      take: 24,
      select: { id: true, number: true, issuedAt: true, planCode: true, billingCycle: true, periodStart: true, periodEnd: true, total: true },
    }),
    db.worker.count({ where: { organizationId: ctx.organizationId, archivedAt: null } }),
    db.salesDocument.count({ where: { organizationId: ctx.organizationId, type: "INVOICE", status: "SENT", issuedAt: { gte: monthStart } } }),
  ]);
  const plan = sub ? currentPlan(sub, now) : null;
  return {
    subscription: sub,
    plan,
    usage: { workers, invoicesThisMonth },
    invoices,
    renewalOpensAt: renewalOpensAt(sub, now),
    nextPeriodStart: nextPeriodStart(sub, now),
    testMode: activeGatewayName() === "test",
  };
}

/** Smallest plan whose limits fit the company's current usage. */
export function suggestedPlan(usage: { workers: number; invoicesThisMonth: number }, plans: readonly { code: PlanCode; maxWorkers: number; maxInvoicesPerMonth: number }[]): PlanCode {
  return (plans.find((p) => usage.workers <= p.maxWorkers && usage.invoicesThisMonth <= p.maxInvoicesPerMonth) ?? plans[plans.length - 1]!).code;
}

// ---------------------------------------------------------------- checkout

export async function quoteCheckout(ctx: OrgContext, plan: PlanCode, cycle: BillingCycleCode, now = new Date()) {
  const sub = await tenantDb(ctx.organizationId).subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  const amounts = checkoutAmounts(plan, cycle);
  const period = periodFor(nextPeriodStart(sub, now), cycle);
  return { amounts, period, startsLater: period.start.getTime() > now.getTime() + 60_000, renewalOpensAt: renewalOpensAt(sub, now) };
}

/**
 * Creates a checkout with the price fixed on the server, then asks the gateway for a
 * payment page. Only the owner can pay. Allowed in read-only mode (to subscribe again).
 */
export async function startCheckout(ctx: OrgContext, plan: PlanCode, cycle: BillingCycleCode, now = new Date()): Promise<{ checkoutId: string; url: string }> {
  assertCan(ctx, "billing.manage");
  getPlan(plan);
  const db = tenantDb(ctx.organizationId);
  const sub = await db.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  if (renewalOpensAt(sub, now)) throw new AppError("renewTooEarly");

  const amounts = checkoutAmounts(plan, cycle);
  const gateway = activeGateway();
  const checkout = await db.billingCheckout.create({
    data: {
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      planCode: plan,
      billingCycle: cycle,
      subtotal: amounts.subtotal,
      vatRate: amounts.vatRate,
      vatAmount: amounts.vatAmount,
      total: amounts.total,
      gateway: gateway.name,
    },
  });

  let created;
  try {
    created = await gateway.createCheckout({
      checkoutId: checkout.id,
      amount: amounts.total,
      description: `${getPlan(plan).code} plan, ${cycle.toLowerCase()} (${formatSar(amounts.total, "en")} incl. VAT)`,
      returnUrl: `${env().APP_URL}/app/billing/return?checkout=${encodeURIComponent(checkout.id)}`,
      expiresAt: new Date(now.getTime() + billingConfig.checkoutExpiryHours * HOUR_MS),
    });
  } catch (e) {
    console.error("[billing] gateway createCheckout failed", e instanceof Error ? e.message : e);
    await db.billingCheckout.update({ where: { id: checkout.id }, data: { status: "FAILED", failureReason: "gatewayUnavailable" } });
    throw new AppError("paymentUnavailable");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.org_id', ${ctx.organizationId}, true)`;
    await tx.billingCheckout.update({ where: { id: checkout.id }, data: { gatewayRef: created.ref } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "billing.checkout_started",
      entityType: "billing_checkout",
      entityId: checkout.id,
      metadata: { plan, cycle, total: amounts.total, gateway: gateway.name },
    });
  });
  return { checkoutId: checkout.id, url: created.url };
}

export async function getCheckout(ctx: OrgContext, checkoutId: string) {
  const checkout = await tenantDb(ctx.organizationId).billingCheckout.findFirst({
    where: { id: checkoutId, organizationId: ctx.organizationId },
    include: { invoice: { select: { id: true, number: true } } },
  });
  if (!checkout) throw new NotFoundError();
  return checkout;
}

/**
 * The return page after the payment page. A redirect proves nothing, so a pending
 * checkout is confirmed by reading it from the gateway; the webhook does the same.
 */
export async function refreshCheckout(ctx: OrgContext, checkoutId: string, now = new Date()) {
  const checkout = await getCheckout(ctx, checkoutId);
  if (checkout.status === "PENDING" && checkout.gatewayRef && checkout.gateway !== "test") {
    try {
      const state = await gatewayFor(checkout.gateway).fetchCheckout(checkout.gatewayRef);
      await applyGatewayState(checkout.id, state, now);
    } catch (e) {
      console.error("[billing] could not confirm checkout with gateway", e instanceof Error ? e.message : e);
    }
    return getCheckout(ctx, checkoutId);
  }
  return checkout;
}

/** The built-in test payment page. Only works while PAYMENT_GATEWAY=test. */
export async function simulateTestPayment(ctx: OrgContext, checkoutId: string, outcome: "paid" | "failed", now = new Date()) {
  assertCan(ctx, "billing.manage");
  const checkout = await getCheckout(ctx, checkoutId);
  if (checkout.gateway !== "test" || activeGatewayName() !== "test") throw new AppError("forbidden");
  await applyGatewayState(
    checkout.id,
    {
      status: outcome,
      amount: checkout.total,
      currency: "SAR",
      paymentId: `test_pay_${checkout.id}`,
      failureReason: outcome === "failed" ? "Declined (test card)" : null,
      live: false,
    },
    now,
  );
}

/** Webhook entry point: look up our checkout by the gateway's id and confirm with the gateway. */
export async function handleGatewayNotification(gatewayRef: string, now = new Date()): Promise<"applied" | "unknown"> {
  const checkout = await systemDb().billingCheckout.findUnique({ where: { gatewayRef }, select: { id: true, gateway: true } });
  if (!checkout) return "unknown";
  const state = await gatewayFor(checkout.gateway).fetchCheckout(gatewayRef);
  await applyGatewayState(checkout.id, state, now);
  return "applied";
}

// ---------------------------------------------------------------- applying a payment

export type ApplyResult = { applied: true; invoiceId: string } | { applied: false; reason: string };

/**
 * Records the gateway's result. Idempotent and safe under concurrent webhook + return
 * page calls: the checkout row is locked and a PAID checkout is never applied twice.
 * A paid amount that does not match the checkout is refused and logged.
 */
export async function applyGatewayState(checkoutId: string, state: GatewayCheckoutState, now = new Date()): Promise<ApplyResult> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM billing_checkouts WHERE id = ${checkoutId} FOR UPDATE`;
    if (locked.length === 0) return { applied: false as const, reason: "notFound" };
    const checkout = await tx.billingCheckout.findUniqueOrThrow({ where: { id: checkoutId } });
    if (checkout.status === "PAID") return { applied: false as const, reason: "alreadyPaid" };

    if (state.status === "pending") return { applied: false as const, reason: "pending" };
    if (state.status !== "paid") {
      await tx.billingCheckout.update({
        where: { id: checkoutId },
        data: { status: state.status === "expired" ? "EXPIRED" : "FAILED", failureReason: state.failureReason?.slice(0, 200) ?? null },
      });
      return { applied: false as const, reason: state.status };
    }
    if (state.amount !== checkout.total || state.currency !== "SAR") {
      console.error(`[billing] paid amount mismatch on checkout ${checkoutId}: expected ${checkout.total} SAR, got ${state.amount} ${state.currency}`);
      await tx.billingCheckout.update({ where: { id: checkoutId }, data: { status: "FAILED", failureReason: "amountMismatch" } });
      return { applied: false as const, reason: "amountMismatch" };
    }

    await tx.$queryRaw`SELECT id FROM subscriptions WHERE "organizationId" = ${checkout.organizationId} FOR UPDATE`;
    const sub = await tx.subscription.findUnique({ where: { organizationId: checkout.organizationId } });
    const cycle = checkout.billingCycle as BillingCycleCode;
    const period = periodFor(nextPeriodStart(sub, now), cycle);

    // A renewal paid before the current paid period ends keeps today's plan until then.
    const plan = sub ? currentPlan(sub, now) : null;
    const runningPaid = !!sub && sub.status === "ACTIVE" && !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime();
    const changes = !!plan && (plan.planCode !== checkout.planCode || plan.billingCycle !== cycle);
    const schedule = runningPaid && changes && period.start.getTime() > now.getTime();
    const subData = {
      status: "ACTIVE" as const,
      currentPeriodStart: runningPaid ? (sub!.currentPeriodStart ?? period.start) : period.start,
      currentPeriodEnd: period.end,
      ...(schedule
        ? { planCode: plan!.planCode, billingCycle: plan!.billingCycle, scheduledPlanCode: checkout.planCode, scheduledCycle: cycle, scheduledFrom: period.start }
        : { planCode: checkout.planCode, billingCycle: cycle, scheduledPlanCode: null, scheduledCycle: null, scheduledFrom: null }),
    };
    if (sub) {
      await tx.subscription.update({ where: { organizationId: checkout.organizationId }, data: subData });
    } else {
      await tx.subscription.create({ data: { organizationId: checkout.organizationId, trialEndsAt: now, ...subData } });
    }

    await tx.billingCheckout.update({
      where: { id: checkoutId },
      data: { status: "PAID", paidAt: now, periodStart: period.start, periodEnd: period.end, gatewayPaymentId: state.paymentId, failureReason: null },
    });
    const invoice = await issueSubscriptionInvoice(tx, { ...checkout, billingCycle: cycle }, period, now);
    await writeAudit(tx, {
      organizationId: checkout.organizationId,
      action: "billing.paid",
      entityType: "billing_checkout",
      entityId: checkoutId,
      metadata: { plan: checkout.planCode, cycle, total: checkout.total, invoice: invoice.number, periodEnd: period.end.toISOString(), live: state.live },
    });
    return { applied: true as const, invoiceId: invoice.id };
  });

  if (result.applied) {
    await sendPaymentReceipt(result.invoiceId).catch((e) => console.error("[billing] receipt email failed", e instanceof Error ? e.message : e));
  }
  return result;
}

export function formatSubscriptionInvoiceNumber(n: number): string {
  return `${billingConfig.invoicePrefix}${String(n).padStart(billingConfig.invoiceDigits, "0")}`;
}

/** Gapless numbering: the counter row is incremented inside the paying transaction. */
async function nextInvoiceNumber(tx: TxClient): Promise<string> {
  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO billing_counters (key, "lastNumber") VALUES ('subscription_invoice', 1)
    ON CONFLICT (key) DO UPDATE SET "lastNumber" = billing_counters."lastNumber" + 1
    RETURNING "lastNumber"`;
  return formatSubscriptionInvoiceNumber(rows[0]!.lastNumber);
}

async function issueSubscriptionInvoice(
  tx: TxClient,
  checkout: { id: string; organizationId: string; planCode: string; billingCycle: BillingCycleCode; subtotal: number; vatRate: number; vatAmount: number; total: number },
  period: { start: Date; end: Date },
  now: Date,
) {
  const org = await tx.organization.findUniqueOrThrow({ where: { id: checkout.organizationId } });
  const seller: InvoiceParty = {
    nameEn: softwareSeller.legalNameEn,
    nameAr: softwareSeller.legalNameAr,
    vatNumber: softwareSeller.vatNumber,
    crNumber: softwareSeller.crNumber,
    addressLine: softwareSeller.addressLine,
    city: softwareSeller.city,
    postalCode: softwareSeller.postalCode || null,
  };
  const buyer: InvoiceParty = {
    nameEn: org.nameEn,
    nameAr: org.nameAr,
    vatNumber: org.vatNumber,
    crNumber: org.crNumber,
    addressLine: org.addressLine,
    city: org.city,
    postalCode: org.postalCode,
  };
  const qrPayload = zatcaQrPayload({ sellerName: seller.nameAr?.trim() || seller.nameEn, vatNumber: seller.vatNumber!, timestamp: now, total: checkout.total, vatAmount: checkout.vatAmount });
  return tx.subscriptionInvoice.create({
    data: {
      organizationId: checkout.organizationId,
      checkoutId: checkout.id,
      number: await nextInvoiceNumber(tx),
      issuedAt: now,
      seller: seller as unknown as Prisma.InputJsonValue,
      buyer: buyer as unknown as Prisma.InputJsonValue,
      planCode: checkout.planCode,
      billingCycle: checkout.billingCycle,
      periodStart: period.start,
      periodEnd: period.end,
      subtotal: checkout.subtotal,
      vatRate: checkout.vatRate,
      vatAmount: checkout.vatAmount,
      total: checkout.total,
      qrPayload,
    },
  });
}

// ---------------------------------------------------------------- invoices

export async function getSubscriptionInvoice(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.read");
  const invoice = await tenantDb(ctx.organizationId).subscriptionInvoice.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!invoice) throw new NotFoundError();
  return { ...invoice, seller: invoice.seller as unknown as InvoiceParty, buyer: invoice.buyer as unknown as InvoiceParty };
}

export type SubscriptionInvoiceDetail = Awaited<ReturnType<typeof getSubscriptionInvoice>>;

async function sendPaymentReceipt(invoiceId: string) {
  const invoice = await systemDb().subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const owners = await prisma.membership.findMany({ where: { organizationId: invoice.organizationId, role: "OWNER" }, select: { user: { select: { email: true, locale: true } } } });
  for (const { user } of owners) {
    const locale = isLocale(user.locale) ? user.locale : "en";
    const t = emailTranslator(locale, "email.billingPaid");
    const tp = emailTranslator(locale, "billing.planNames");
    const amount = formatSar(invoice.total, locale);
    const url = `${env().APP_URL}/app/billing`;
    const body = t("body", { plan: tp(invoice.planCode), amount, number: invoice.number });
    await sendEmail({
      to: user.email,
      subject: t("subject", { number: invoice.number }),
      text: `${body}\n\n${url}`,
      html: emailLayout({ dir: localeDir(locale), heading: t("heading"), body, cta: { label: t("cta"), url }, footer: t("footer") }),
    });
  }
}
