import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandMark } from "@/components/layout/brand-mark";
import { LanguageSwitch } from "@/components/layout/language-switch";
import { getSession } from "@/features/auth/session";
import { AcceptInviteForm } from "@/features/organizations/components/accept-invite-form";
import { orgDisplayName } from "@/features/organizations/components/org-switcher";
import { findInvitationByToken } from "@/features/organizations/service";

export const metadata: Metadata = { title: "Invitation", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, locale, session] = await Promise.all([getTranslations(), getLocale(), getSession()]);
  const invitation = token.length <= 200 ? await findInvitationByToken(token) : null;
  const next = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-dvh flex-col px-4">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-4">
        <BrandMark />
        <LanguageSwitch />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 pt-4 sm:pt-10">
        <Card className="space-y-5">
          {!invitation ? (
            <>
              <Alert tone="error">{t("invite.invalid")}</Alert>
              {session ? <ButtonLink href="/app" variant="secondary" className="w-full">{t("invite.goHome")}</ButtonLink> : null}
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-slate-900">{t("invite.title", { org: orgDisplayName(invitation.organization, locale) })}</h1>
                <p className="text-slate-600">{t("invite.subtitle", { role: t(`members.roles.${invitation.role}`) })}</p>
              </div>
              {session ? (
                <>
                  <p className="text-sm text-slate-500">{t("invite.signedInAs", { email: session.user.email })}</p>
                  <AcceptInviteForm token={token} />
                </>
              ) : (
                <div className="space-y-3">
                  <ButtonLink href={`/sign-up?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`} size="lg" className="w-full">
                    {t("invite.signUpToAccept")}
                  </ButtonLink>
                  <ButtonLink href={`/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`} variant="secondary" size="lg" className="w-full">
                    {t("invite.signInToAccept")}
                  </ButtonLink>
                </div>
              )}
            </>
          )}
        </Card>
      </main>
    </div>
  );
}
