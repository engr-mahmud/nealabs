import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";
import { GatewayError, type GatewayCheckoutState, type PaymentGateway } from "./types";

/**
 * Moyasar (Saudi gateway: mada, Visa/Mastercard, Apple Pay) using its hosted Invoices
 * page: we create an invoice, send the customer to its url, and confirm the result by
 * reading the invoice back with the secret key. Auth is HTTP Basic with the secret key
 * as user name and an empty password.
 *
 * Checked against docs.moyasar.com in Nov 2026, but not yet against a live account:
 * confirm the invoice status values and the payment fields with a sk_test_ key before launch.
 */

const invoiceSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  url: z.string().optional(),
  payments: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        amount: z.number().int(),
        message: z.string().nullish(),
        live: z.boolean().optional(),
      }),
    )
    .optional(),
});

function authHeader(): string {
  const key = env().MOYASAR_SECRET_KEY;
  if (!key) throw new GatewayError("MOYASAR_SECRET_KEY is not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${env().MOYASAR_API_URL}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) {
    // Never log the key or full response bodies; the status and type are enough to debug.
    const body = (await res.json().catch(() => null)) as { type?: string } | null;
    throw new GatewayError(`Moyasar ${path} failed: ${res.status} ${body?.type ?? ""}`.trim());
  }
  return res.json();
}

export function mapInvoice(raw: unknown): GatewayCheckoutState {
  const inv = invoiceSchema.parse(raw);
  const paid = inv.payments?.find((p) => p.status === "paid");
  const lastFailed = [...(inv.payments ?? [])].reverse().find((p) => p.status === "failed");
  const status = inv.status === "paid" || paid ? "paid" : inv.status === "expired" || inv.status === "canceled" ? "expired" : "pending";
  return {
    status,
    amount: paid?.amount ?? inv.amount,
    currency: inv.currency.toUpperCase(),
    paymentId: paid?.id ?? null,
    failureReason: status === "paid" ? null : (lastFailed?.message ?? null),
    live: paid?.live ?? !(env().MOYASAR_SECRET_KEY ?? "").startsWith("sk_test_"),
  };
}

export const moyasarGateway: PaymentGateway = {
  name: "moyasar",
  async createCheckout(input) {
    const raw = await call("/invoices", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amount,
        currency: "SAR",
        description: input.description,
        success_url: input.returnUrl,
        back_url: input.returnUrl,
        expired_at: input.expiresAt.toISOString(),
        metadata: { checkout_id: input.checkoutId },
      }),
    });
    const inv = invoiceSchema.parse(raw);
    if (!inv.url) throw new GatewayError("Moyasar invoice has no url");
    return { ref: inv.id, url: inv.url };
  },
  async fetchCheckout(ref) {
    return mapInvoice(await call(`/invoices/${encodeURIComponent(ref)}`));
  },
};
