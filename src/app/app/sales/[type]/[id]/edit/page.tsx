import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/errors";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { SalesDocForm } from "@/features/sales/components/sales-doc-form";
import { salesDocFormValues } from "@/features/sales/form-values";
import { getSalesDoc, isEditable, listClientsWithSites } from "@/features/sales/service";
import type { OrgContext } from "@/features/organizations/context";

import { typeSlugs } from "@/features/sales/status";

async function creditRoom(ctx: OrgContext, invoiceId: string) {
  const invoice = await getSalesDoc(ctx, invoiceId);
  return invoice.total - invoice.creditedAmount;
}

export const metadata: Metadata = { title: "Edit document" };

export default async function EditSalesDocPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireOrgPage();
  const doc = await getSalesDoc(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const slug = typeSlugs[doc.type];
  if (!canWriteData(ctx) || !isEditable(doc)) redirect(`/app/sales/${slug}/${id}`);
  const [t, clients] = await Promise.all([getTranslations("sales"), listClientsWithSites(ctx)]);
  // Keep the current client in the list even if it was archived after the draft was made.
  const options = clients.some((c) => c.id === doc.clientId) ? clients : [{ id: doc.client.id, nameEn: doc.client.nameEn, nameAr: doc.client.nameAr, sites: doc.site ? [doc.site] : [] }, ...clients];

  return (
    <div className="max-w-4xl">
      <PageHeader title={t("editTitle", { name: doc.number ?? t(`types.${slug}.draftName`) })} />
      <SalesDocForm
        type={slug}
        id={doc.id}
        clients={options}
        values={salesDocFormValues(doc)}
        credit={
          doc.type === "CREDIT_NOTE" && doc.creditedInvoice
            ? { invoiceId: doc.creditedInvoice.id, invoiceNumber: doc.creditedInvoice.number ?? "", clientName: doc.buyer.nameEn, maxTotal: await creditRoom(ctx, doc.creditedInvoice.id) }
            : undefined
        }
      />
    </div>
  );
}
