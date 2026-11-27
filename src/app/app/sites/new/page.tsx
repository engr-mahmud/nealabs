import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireOrgPage } from "@/features/organizations/current";
import { listClientOptions } from "@/features/clients/service";
import { SiteForm } from "@/features/sites/components/site-form";
import { canWriteData } from "@/features/master-data/permissions";

export const metadata: Metadata = { title: "New site" };

export default async function NewSitePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { ctx } = await requireOrgPage();
  if (!canWriteData(ctx)) redirect("/app/sites");
  const { clientId } = await searchParams;
  const [t, locale, clients] = await Promise.all([getTranslations("sites"), getLocale(), listClientOptions(ctx)]);
  if (clients.length === 0) redirect("/app/clients/new");
  const preselected = clients.find((c) => c.id === clientId)?.id ?? (clients.length === 1 ? clients[0]!.id : "");
  return (
    <div className="max-w-3xl">
      <PageHeader title={t("newTitle")} />
      <SiteForm
        values={{ clientId: preselected }}
        clients={clients.map((c) => ({ id: c.id, name: locale === "ar" && c.nameAr ? c.nameAr : c.nameEn }))}
        returnTo={preselected && clientId ? `/app/clients/${preselected}` : "/app/sites"}
      />
    </div>
  );
}
