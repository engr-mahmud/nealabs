import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { NotFoundError } from "@/lib/errors";
import { formatSar } from "@/lib/money";
import { halalasToInput, toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { deletePaymentAction } from "@/features/sales/actions";
import { DocActions, PaymentForm, type DocCommand } from "@/features/sales/components/doc-actions";
import { invoiceKind, invoiceQr } from "@/features/sales/document-data";
import { getSalesDoc, isEditable } from "@/features/sales/service";
import { displayStatus, statusTone, typeSlugs } from "@/features/sales/status";
import { formatPercent, formatQuantity } from "@/features/sales/totals";

export const metadata: Metadata = { title: "Document" };

export default async function SalesDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { type: slugParam, id } = await params;
  const { ctx } = await requireOrgPage();
  const doc = await getSalesDoc(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const slug = typeSlugs[doc.type];
  if (slugParam !== slug) redirect(`/app/sales/${slug}/${id}`);

  const [t, tc, locale, format] = await Promise.all([getTranslations("sales"), getTranslations("common"), getLocale(), getFormatter()]);
  const done = param(await searchParams, "done");
  const today = todayInRiyadh();
  const status = displayStatus({ ...doc, converted: !!doc.convertedTo }, today);
  const canWrite = canWriteData(ctx);
  const editable = isEditable(doc);
  const isCredit = doc.type === "CREDIT_NOTE";
  const issued = doc.type === "INVOICE" && doc.status === "SENT";
  const taxIssued = (doc.type === "INVOICE" || isCredit) && doc.status === "SENT";
  const balance = doc.balance;
  const creditRoom = doc.total - doc.creditedAmount;
  const money = (h: number) => formatSar(h, locale);
  const date = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium", timeZone: "UTC" }) : "—");
  const qr = invoiceQr(doc);
  const qrSvg = qr ? await QRCode.toString(qr, { type: "svg", errorCorrectionLevel: "M", margin: 0 }) : null;
  const clientName = locale === "ar" && doc.buyer.nameAr ? doc.buyer.nameAr : doc.buyer.nameEn;
  const docName = issued ? t(`kinds.${invoiceKind(doc.buyer)}`) : t(`types.${slug}.singular`);

  const commands: DocCommand[] = [];
  if (canWrite && !doc.convertedTo) {
    if (doc.type === "INVOICE" && doc.status === "DRAFT") commands.push({ command: "issue", label: t("actions.issue"), primary: true });
    if (isCredit && doc.status === "DRAFT") commands.push({ command: "issue", label: t("actions.issueCredit"), primary: true });
    if (doc.type === "QUOTATION") {
      commands.push({ command: "convert-INVOICE", label: t("actions.toInvoice"), primary: true });
      commands.push({ command: "convert-PROFORMA", label: t("actions.toProforma") });
    }
    if (doc.type === "PROFORMA") commands.push({ command: "convert-INVOICE", label: t("actions.toInvoice"), primary: true });
    if (doc.type !== "INVOICE" && doc.status === "DRAFT") commands.push({ command: "send", label: t("actions.markSent") });
  }
  const canDelete = canWrite && doc.status === "DRAFT" && !doc.convertedTo;

  return (
    <div className="max-w-4xl space-y-4">
      <Link href={`/app/sales/${slug}`} className="inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
        <span aria-hidden className="me-1 rtl:rotate-180">←</span> {t(`types.${slug}.plural`)}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">
              {docName} <span className="ltr-nums">{doc.number ?? ""}</span>
            </h1>
            <Badge tone={statusTone[status]}>{t(`status.${status}`)}</Badge>
          </div>
          <p className="mt-1 text-slate-600">
            {clientName}
            {doc.site ? ` · ${doc.site.name}` : ""}
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-slate-900 sm:text-end">{money(doc.total)}</p>
      </div>

      {done ? <Alert tone="success">{t(`done.${done}`)}</Alert> : null}
      {(doc.type === "INVOICE" || isCredit) && doc.status === "DRAFT" ? (
        <Alert tone={doc.seller.vatNumber ? "info" : "warning"}>
          {doc.seller.vatNumber ? (
            t(isCredit ? "credit.draftNote" : "draftInvoiceNote")
          ) : (
            <>
              {t("vatMissingNote")}{" "}
              <Link href="/app/settings/organization#legal" className="font-medium underline">
                {t("addVat")}
              </Link>
            </>
          )}
        </Alert>
      ) : null}
      {doc.source ? (
        <p className="text-sm text-slate-600">
          {t("createdFrom")}{" "}
          <Link href={`/app/sales/${typeSlugs[doc.source.type]}/${doc.source.id}`} className="font-medium text-brand hover:underline">
            <span className="ltr-nums">{doc.source.number}</span>
          </Link>
        </p>
      ) : null}
      {doc.creditedInvoice ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <p className="text-slate-600">
            {t("credit.forInvoiceLabel")}{" "}
            <Link href={`/app/sales/invoices/${doc.creditedInvoice.id}`} className="font-medium text-brand hover:underline">
              <span className="ltr-nums">{doc.creditedInvoice.number}</span>
            </Link>
          </p>
          {doc.reason ? (
            <p className="mt-1 text-slate-900">
              <span className="text-slate-600">{t("fields.reason")}:</span> {doc.reason}
            </p>
          ) : null}
        </div>
      ) : null}
      {doc.convertedTo ? (
        <Alert tone="success">
          {t("convertedTo")}{" "}
          <Link href={`/app/sales/${typeSlugs[doc.convertedTo.type]}/${doc.convertedTo.id}`} className="font-medium underline">
            {t(`types.${typeSlugs[doc.convertedTo.type]}.singular`)} <span className="ltr-nums">{doc.convertedTo.number ?? t("draftNumber")}</span>
          </Link>
        </Alert>
      ) : null}

      <Card className={commands.length || canDelete ? "space-y-4" : undefined}>
        <DocActions id={doc.id} type={slug} commands={commands} canDelete={canDelete} />
        <div className={`flex flex-wrap gap-2 ${commands.length || canDelete ? "border-t border-slate-100 pt-4" : ""}`}>
          {canWrite && editable ? (
            <ButtonLink href={`/app/sales/${slug}/${doc.id}/edit`} variant="secondary">
              {tc("edit")}
            </ButtonLink>
          ) : null}
          <a href={`/api/sales/${doc.id}/print?lang=en`} target="_blank" rel="noopener" className={buttonClass("secondary")}>
            {t("actions.printEn")}
          </a>
          <a href={`/api/sales/${doc.id}/print?lang=ar`} target="_blank" rel="noopener" className={buttonClass("secondary")}>
            {t("actions.printAr")}
          </a>
          <a href={`/api/sales/${doc.id}/pdf?lang=en`} className={buttonClass("ghost")}>
            {t("actions.pdfEn")}
          </a>
          <a href={`/api/sales/${doc.id}/pdf?lang=ar`} className={buttonClass("ghost")}>
            {t("actions.pdfAr")}
          </a>
        </div>
      </Card>

      {issued ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{t("credit.title")}</CardTitle>
            {canWrite && creditRoom > 0 ? (
              <ButtonLink href={`/app/sales/credit-notes/new?invoiceId=${doc.id}`} variant="secondary" size="sm">
                + {t("credit.create")}
              </ButtonLink>
            ) : null}
          </div>
          {doc.creditNotes.length === 0 ? (
            <p className="text-sm text-slate-600">{t("credit.none")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {doc.creditNotes.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/sales/credit-notes/${c.id}`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg px-1 hover:bg-slate-50">
                    <span className="text-sm text-slate-900">
                      <span className="ltr-nums font-medium">{c.number ?? t("draftNumber")}</span>
                      <span className="text-slate-500"> · {date(c.issueDate)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm tabular-nums">-{money(c.total)}</span>
                      <Badge tone={c.status === "DRAFT" ? "neutral" : "brand"}>{t(`status.${c.status === "DRAFT" ? "draft" : "sent"}`)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {issued ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle>{t("payments.title")}</CardTitle>
            <p className="text-sm text-slate-600">
              {t("payments.paidOf", { paid: money(doc.paidAmount), total: money(doc.total) })}
              {doc.creditedAmount > 0 ? ` · ${t("payments.credited", { amount: money(doc.creditedAmount) })}` : ""}
              {balance > 0 ? (
                <>
                  {" · "}
                  <strong className="text-slate-900">{t("payments.balance", { amount: money(balance) })}</strong>
                </>
              ) : null}
            </p>
          </div>
          {doc.payments.length > 0 ? (
            <ul className="mb-4 divide-y divide-slate-100">
              {doc.payments.map((p) => (
                <li key={p.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm text-slate-700">
                    <strong className="tabular-nums text-slate-900">{money(p.amount)}</strong> · {date(p.paidOn)} · {t(`methods.${p.method}`)}
                    {p.reference ? <span className="text-slate-500"> · {p.reference}</span> : null}
                  </span>
                  {canWrite ? (
                    <form action={deletePaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmSubmit label={tc("remove")} confirmText={t("payments.deleteConfirm")} confirmLabel={tc("remove")} cancelLabel={tc("cancel")} />
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-slate-600">{t("payments.none")}</p>
          )}
          {canWrite && balance > 0 ? <PaymentForm id={doc.id} balance={halalasToInput(balance)} today={toDateInput(today)} /> : null}
          {balance === 0 ? <p className="text-sm font-medium text-emerald-700">{doc.creditedAmount >= doc.total ? t("payments.fullyCredited") : t("payments.fullyPaid")}</p> : null}
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">{taxIssued ? t("fields.issuedAt") : t("fields.issueDate")}</dt>
              <dd className="font-medium text-slate-900">
                {taxIssued && doc.issuedAt ? format.dateTime(doc.issuedAt, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : date(doc.issueDate)}
              </dd>
            </div>
            {isCredit ? null : (
              <div>
                <dt className="text-slate-500">{doc.type === "QUOTATION" ? t("fields.validUntil") : t("fields.dueDate")}</dt>
                <dd className="font-medium text-slate-900">{date(doc.dueDate)}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">{t("fields.buyerVat")}</dt>
              <dd className="font-medium text-slate-900 ltr-nums">{doc.buyer.vatNumber ?? "—"}</dd>
            </div>
          </dl>
          {qrSvg ? <div className="size-28 justify-self-start sm:justify-self-end [&_svg]:size-full" aria-label={t("qrLabel")} role="img" dangerouslySetInnerHTML={{ __html: qrSvg }} /> : null}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 text-start font-medium">{t("fields.description")}</th>
                <th className="py-2 text-end font-medium">{t("fields.quantity")}</th>
                <th className="py-2 text-end font-medium">{t("fields.unitPrice")}</th>
                <th className="py-2 text-end font-medium">{t("fields.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pe-2">
                    <div className="text-slate-900">{l.description}</div>
                    {l.descriptionAr ? (
                      <div className="text-slate-500" dir="rtl" lang="ar">
                        {l.descriptionAr}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 text-end tabular-nums">{formatQuantity(l.quantity)}</td>
                  <td className="py-2 text-end tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-end tabular-nums">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ms-auto mt-4 max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">{t("totals.subtotal")}</dt>
            <dd className="tabular-nums">{money(doc.subtotal)}</dd>
          </div>
          {doc.discountAmount > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">
                {t("totals.discount")}
                {doc.discountType === "PERCENT" ? ` (${formatPercent(doc.discountValue)}%)` : ""}
              </dt>
              <dd className="tabular-nums">-{money(doc.discountAmount)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-slate-600">{t("totals.vat", { rate: formatPercent(doc.vatRate) })}</dt>
            <dd className="tabular-nums">{money(doc.vatAmount)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-semibold">
            <dt>{t("totals.total")}</dt>
            <dd className="tabular-nums">{money(doc.total)}</dd>
          </div>
        </dl>
        {doc.notes || doc.terms ? (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
            {doc.notes ? (
              <div>
                <p className="font-medium text-slate-900">{t("fields.notes")}</p>
                <p className="whitespace-pre-line text-slate-600">{doc.notes}</p>
              </div>
            ) : null}
            {doc.terms ? (
              <div>
                <p className="font-medium text-slate-900">{t("fields.terms")}</p>
                <p className="whitespace-pre-line text-slate-600">{doc.terms}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
