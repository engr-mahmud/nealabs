import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { salesConfig } from "@/config/sales";
import { toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { SalesDocForm } from "@/features/sales/components/sales-doc-form";
import { listClientsWithSites } from "@/features/sales/service";
import { typeFromSlug, type SalesTypeSlug } from "@/features/sales/status";

export const metadata: Metadata = { title: "New document" };

const DAY_MS = 86_400_000;

export default async function NewSalesDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const slug = (await params).type as SalesTypeSlug;
  const type = typeFromSlug(slug);
  if (!type) notFound();
  const { ctx } = await requireOrgPage();
  const t = await getTranslations("sales");
  if (!canWriteData(ctx)) {
    return <Alert tone="warning">{(await getTranslations("errors"))(ctx.access.readOnly ? "readOnly" : "forbidden")}</Alert>;
  }
  const clients = await listClientsWithSites(ctx);
  const sp = await searchParams;
  const preselected = param(sp, "clientId");
  const today = todayInRiyadh();
  const days = type === "QUOTATION" ? salesConfig.defaultValidDays : salesConfig.defaultDueDays;

  return (
    <div className="max-w-4xl">
      <PageHeader title={t(`types.${slug}.new`)} subtitle={t(`types.${slug}.newSubtitle`)} />
      {clients.length === 0 ? (
        <EmptyState title={t("form.noClientsTitle")} body={t("form.noClientsBody")} action={<ButtonLink href="/app/clients/new" size="lg">+ {t("form.addClient")}</ButtonLink>} />
      ) : (
        <SalesDocForm
          type={slug}
          clients={clients}
          values={{
            clientId: clients.some((c) => c.id === preselected) ? preselected : clients.length === 1 ? clients[0]!.id : "",
            siteId: "",
            issueDate: toDateInput(today),
            dueDate: toDateInput(new Date(today.getTime() + days * DAY_MS)),
            discountType: "NONE",
            discountValue: "",
            notes: "",
            terms: "",
            lines: [],
          }}
        />
      )}
    </div>
  );
}
