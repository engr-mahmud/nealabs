import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ResetPasswordForm } from "@/features/auth/components/auth-forms";
import { isResetTokenValid } from "@/features/auth/service";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.reset"))("title"), referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const t = await getTranslations("auth.reset");
  const valid = typeof token === "string" && token.length <= 200 && (await isResetTokenValid(token));
  return (
    <AuthCard title={t("title")}>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="space-y-4">
          <Alert tone="error">{t("invalid")}</Alert>
          <ButtonLink href="/forgot-password" variant="secondary" className="w-full">
            {t("requestNew")}
          </ButtonLink>
        </div>
      )}
    </AuthCard>
  );
}
