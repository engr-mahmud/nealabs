import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { NotFoundError } from "@/lib/errors";
import { formatSar } from "@/lib/money";
import { halalasToInput, toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { EntryForm } from "@/features/finance/components/entry-form";
import { VoidForm } from "@/features/finance/components/void-form";
import { entryFormOptions, getEntry } from "@/features/finance/service";

export const metadata: Metadata = { title: "Entry" };

export default async function EntryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const { ctx } = await requireOrgPage();
  const entry = await getEntry(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [t, ts, locale, format] = await Promise.all([getTranslations("finance"), getTranslations("sales"), getLocale(), getFormatter()]);
  const done = param(await searchParams, "done");
  const canWrite = canWriteData(ctx);
  const editable = canWrite && entry.source === "MANUAL" && !entry.voidedAt;
  const voidable = canWrite && (entry.source === "MANUAL" || entry.source === "INVOICE_REFUND") && !entry.voidedAt;
  const money = (h: number) => formatSar(h, locale);
  const name = (x: { nameEn: string; nameAr: string | null }) => (locale === "ar" && x.nameAr ? x.nameAr : x.nameEn);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeZone: "UTC" });
  const options = editable ? await entryFormOptions(ctx, { categoryId: entry.categoryId, siteId: entry.siteId }) : null;
  const invoiceId = entry.salesPayment?.documentId ?? entry.salesDocumentId;
  const invoiceNumber = entry.salesPayment?.document.number ?? entry.description ?? "";
  const signed = entry.kind === "INCOME" ? entry.amount : -entry.amount;

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/app/finance" className="inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
        <span aria-hidden className="me-1 rtl:rotate-180">←</span> {t("tabs.transactions")}
      </Link>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{editable ? t("editTitle") : name(entry.category)}</h1>
            <Badge tone={entry.kind === "INCOME" ? "success" : "neutral"}>{t(`kinds.${entry.kind}`)}</Badge>
            {entry.voidedAt ? <Badge tone="danger">{t("voided")}</Badge> : null}
            {entry.source !== "MANUAL" ? <Badge tone="brand">{t(`sources.${entry.source}`)}</Badge> : null}
          </div>
          <p className="mt-1 text-slate-600">
            {date(entry.date)}
            {entry.site ? ` · ${entry.site.name}` : ""}
            {entry.client ? ` · ${name(entry.client)}` : ""}
          </p>
        </div>
        <p className={cn("text-2xl font-semibold tabular-nums", entry.voidedAt ? "text-slate-400 line-through" : signed >= 0 ? "text-emerald-700" : "text-slate-900")} dir="ltr">
          {signed >= 0 ? "+" : "−"}
          {money(Math.abs(signed))}
        </p>
      </div>

      {done === "saved" ? <Alert tone="success">{t("done.saved")}</Alert> : null}
      {done === "voided" || entry.voidedAt ? (
        <Alert tone="warning">
          {entry.voidedAt ? t("voidedOn", { date: format.dateTime(entry.voidedAt, { dateStyle: "medium", timeZone: "Asia/Riyadh" }) }) : null}
          {entry.voidReason ? ` · ${entry.voidReason}` : ""}
          {done === "voided" ? <span className="block">{t("done.voided")}</span> : null}
        </Alert>
      ) : null}
      {entry.source !== "MANUAL" ? (
        <Alert tone="info">
          {t(`auto.${entry.source}`, { number: invoiceNumber })}
          {invoiceId ? (
            <>
              {" "}
              <Link href={`/app/sales/invoices/${invoiceId}`} className="font-medium underline">
                {t("openInvoice")}
              </Link>
            </>
          ) : null}
          {entry.salarySheetId ? (
            <>
              {" "}
              <Link href={`/app/payroll/${entry.salarySheetId}`} className="font-medium underline">
                {t("openSalarySheet")}
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      {editable && options ? (
        <EntryForm
          id={entry.id}
          kind={entry.kind}
          options={options}
          values={{
            amount: halalasToInput(entry.amount),
            includesVat: entry.vatAmount > 0 ? "on" : "",
            categoryId: entry.categoryId,
            date: toDateInput(entry.date),
            method: entry.method ?? "",
            siteId: entry.siteId ?? "",
            description: entry.description ?? "",
            reference: entry.reference ?? "",
          }}
        />
      ) : (
        <Card>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[
              [t("fields.categoryId"), name(entry.category)],
              [t("fields.vat"), money(Math.abs(entry.vatAmount))],
              [t("fields.net"), money(Math.abs(entry.amount - entry.vatAmount))],
              [t("fields.method"), entry.method ? ts(`methods.${entry.method}`) : "—"],
              [t("fields.reference"), entry.reference ?? "—"],
              [t("fields.description"), entry.description ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-slate-500">{label}</dt>
                <dd className="font-medium break-words text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {voidable ? (
        <Card>
          <CardTitle className="mb-1 text-base">{t("void.title")}</CardTitle>
          <p className="mb-3 text-sm text-slate-600">{t("void.body")}</p>
          <VoidForm id={entry.id} />
        </Card>
      ) : null}
      {entry.voidedAt ? <ButtonLink href="/app/finance?voided=1" variant="secondary">{t("showVoided")}</ButtonLink> : null}
    </div>
  );
}
