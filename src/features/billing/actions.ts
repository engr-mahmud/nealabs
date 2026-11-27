"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BILLING_CYCLES, PLANS } from "@/config/plans";
import { actionError, parseForm, type ActionState } from "@/lib/action";
import { requireOrgAction } from "@/features/organizations/current";
import { simulateTestPayment, startCheckout } from "./service";

const checkoutSchema = z.object({
  plan: z.enum(PLANS.map((p) => p.code) as [string, ...string[]]),
  cycle: z.enum(BILLING_CYCLES),
});

/** Owner pays for a plan: creates the checkout and sends the browser to the payment page. */
export async function startCheckoutAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const { data, error } = await parseForm(checkoutSchema, formData);
  if (error) return error;
  let url: string;
  try {
    const ctx = await requireOrgAction();
    ({ url } = await startCheckout(ctx, data.plan as (typeof PLANS)[number]["code"], data.cycle));
  } catch (e) {
    return actionError(e, formData);
  }
  redirect(url);
}

const testPaySchema = z.object({ checkoutId: z.string().min(1).max(40), outcome: z.enum(["paid", "failed"]) });

/** Built-in test payment page (PAYMENT_GATEWAY=test only). */
export async function testPayAction(formData: FormData) {
  const parsed = testPaySchema.safeParse({ checkoutId: formData.get("checkoutId"), outcome: formData.get("outcome") });
  if (!parsed.success) return;
  await simulateTestPayment(await requireOrgAction(), parsed.data.checkoutId, parsed.data.outcome);
  revalidatePath("/app", "layout");
  redirect(`/app/billing/return?checkout=${encodeURIComponent(parsed.data.checkoutId)}`);
}
