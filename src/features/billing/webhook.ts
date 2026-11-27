import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { systemDb } from "@/lib/db";
import { env } from "@/lib/env";
import { handleGatewayNotification } from "./service";

/**
 * Moyasar webhook. Moyasar puts the dashboard's "Secret Token" in the JSON body
 * (secret_token); there is no header signature, so the token is compared in constant
 * time and the event body is never trusted for amounts or status: we only take the
 * invoice id from it and read the invoice back from Moyasar with our secret key.
 */
const eventSchema = z.object({
  type: z.string().max(64),
  secret_token: z.string().max(512).optional(),
  live: z.boolean().optional(),
  data: z
    .object({
      id: z.string().max(100).optional(),
      invoice_id: z.string().max(100).nullish(),
      metadata: z.record(z.string(), z.unknown()).nullish(),
    })
    .passthrough()
    .optional(),
});

export type WebhookOutcome = { status: 200 | 400 | 401 | 500; body: string };

function tokenMatches(given: string | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function handleMoyasarWebhook(rawBody: string): Promise<WebhookOutcome> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "invalid json" };
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return { status: 400, body: "invalid event" };
  const event = parsed.data;
  if (!tokenMatches(event.secret_token, env().MOYASAR_WEBHOOK_SECRET)) return { status: 401, body: "unauthorized" };
  if (!event.type.startsWith("payment_")) return { status: 200, body: "ignored" };

  let ref = event.data?.invoice_id ?? null;
  const checkoutId = event.data?.metadata?.checkout_id;
  if (!ref && typeof checkoutId === "string") {
    const checkout = await systemDb().billingCheckout.findUnique({ where: { id: checkoutId.slice(0, 40) }, select: { gatewayRef: true, gateway: true } });
    if (checkout?.gateway === "moyasar") ref = checkout.gatewayRef;
  }
  if (!ref) return { status: 200, body: "no invoice" };

  try {
    const result = await handleGatewayNotification(ref);
    return { status: 200, body: result };
  } catch (e) {
    // A 5xx makes Moyasar retry later (1, 10, 30 minutes, 1 and 2 hours).
    console.error("[billing] webhook processing failed", e instanceof Error ? e.message : e);
    return { status: 500, body: "retry" };
  }
}
