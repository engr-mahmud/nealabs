"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { acceptInvitationAction } from "../actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const [state, action] = useActionState(acceptInvitationAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton size="lg" className="w-full">
        {t("accept")}
      </SubmitButton>
    </form>
  );
}
