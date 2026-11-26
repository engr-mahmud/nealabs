import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/features/auth/components/auth-forms";
import { safeNextPath } from "@/features/auth/schemas";
import { getSession } from "@/features/auth/session";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.signIn"))("title") };
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next: rawNext, email } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getSession()) redirect(next ?? "/app");
  const t = await getTranslations("auth.signIn");
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("noAccount")}{" "}
          <Link href={signUpHref} className="font-medium text-brand hover:underline">
            {t("createAccount")}
          </Link>
        </>
      }
    >
      <SignInForm next={next} defaultEmail={email} />
    </AuthCard>
  );
}
