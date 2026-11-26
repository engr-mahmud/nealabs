import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { maskPhone } from "@/lib/phone";
import { PhoneForm, ResendCodeForm, VerifyCodeForm } from "@/features/auth/components/verify-phone-forms";
import { getActiveCode } from "@/features/auth/phone-verification";
import { safeNextPath } from "@/features/auth/schemas";
import { requireSession } from "@/features/auth/session";
import { AuthCard } from "../auth-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("verify"))("title") };
}

export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ next?: string; change?: string }> }) {
  const { next: rawNext, change } = await searchParams;
  const next = safeNextPath(rawNext);
  const session = await requireSession();
  if (session.user.phoneVerifiedAt) redirect(next ?? "/onboarding");

  const t = await getTranslations("verify");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId }, select: { pendingPhone: true } });
  const changeHref = `/verify-phone?change=1${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  // No number yet (older account) or the user wants to fix a typo.
  if (!user.pendingPhone || change === "1") {
    return (
      <AuthCard title={t("title")} subtitle={t("enterPhone")}>
        <PhoneForm next={next} submitLabel={t("sendCode")} />
      </AuthCard>
    );
  }

  const phone = maskPhone(user.pendingPhone);
  const active = await getActiveCode(session.userId);
  return (
    <AuthCard
      title={t("title")}
      subtitle={active ? t("subtitle", { phone }) : t("noCode", { phone })}
      footer={
        <Link href={changeHref} className="font-medium text-brand hover:underline">
          {t("change")}
        </Link>
      }
    >
      {active ? (
        <div className="space-y-4">
          <VerifyCodeForm next={next} />
          <ResendCodeForm />
        </div>
      ) : (
        <ResendCodeForm primary />
      )}
    </AuthCard>
  );
}
