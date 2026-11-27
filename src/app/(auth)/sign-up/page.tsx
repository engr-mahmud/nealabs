import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SignUpForm } from "@/features/auth/components/auth-forms";
import { safeNextPath } from "@/features/auth/schemas";
import { getSession } from "@/features/auth/session";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("auth.signUp"))("title") };
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const { next: rawNext, email } = await searchParams;
  const next = safeNextPath(rawNext);
  if (await getSession()) redirect(next ?? "/app");
  const t = await getTranslations("auth.signUp");
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";
  return (
    <AuthCard
      title={t("title")}
      subtitle={t("subtitle")}
      footer={
        <>
          {t("haveAccount")}{" "}
          <Link href={signInHref} className="font-medium text-brand hover:underline">
            {t("signIn")}
          </Link>
        </>
      }
    >
      <SignUpForm next={next} defaultEmail={email} />
      <p className="mt-4 text-xs text-slate-600">
        {t.rich("agree", {
          terms: (chunks) => (
            <Link href="/terms" target="_blank" className="underline">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" target="_blank" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </AuthCard>
  );
}
