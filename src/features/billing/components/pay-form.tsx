"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action";
import { startCheckoutAction } from "../actions";

/** One button: creates the checkout on the server and goes to the payment page. */
export function PayForm({ plan, cycle, label, pendingLabel }: { plan: string; cycle: string; label: string; pendingLabel: string }) {
  const [state, action] = useActionState<ActionState | null, FormData>(startCheckoutAction, null);
  const error = state && !state.ok ? (state.message ?? Object.values(state.fieldErrors ?? {})[0]) : null;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="cycle" value={cycle} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <SubmitButton size="lg" className="w-full" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
    </form>
  );
}
