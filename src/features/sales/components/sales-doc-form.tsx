"use client";

import { useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextareaField } from "@/components/ui/textarea-field";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { parseSarToHalalas } from "@/lib/parse";
import { salesConfig } from "@/config/sales";
import { saveSalesDocAction } from "../actions";
import { computeTotals, formatPercent, parsePercent, parseQuantity, type DiscountKind } from "../totals";
import type { SalesTypeSlug } from "../status";

export interface LineValues {
  description: string;
  descriptionAr: string;
  quantity: string;
  unitPrice: string;
}

export interface SalesDocValues {
  clientId: string;
  siteId: string;
  issueDate: string;
  dueDate: string;
  discountType: DiscountKind;
  discountValue: string;
  notes: string;
  terms: string;
  reason: string;
  lines: LineValues[];
}

export interface ClientOption {
  id: string;
  nameEn: string;
  nameAr: string | null;
  sites: { id: string; name: string }[];
}

const emptyLine: LineValues = { description: "", descriptionAr: "", quantity: "1", unitPrice: "" };

let keySeq = 0;
const nextKey = () => `l${++keySeq}`;

/** For a credit note: the invoice it corrects. Client and site then come from the invoice. */
export interface CreditFor {
  invoiceId: string;
  invoiceNumber: string;
  clientName: string;
  /** Halalas that can still be credited. */
  maxTotal: number;
}

export function SalesDocForm({ type, id, clients, values, credit }: { type: SalesTypeSlug; id?: string; clients: ClientOption[]; values: SalesDocValues; credit?: CreditFor }) {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action] = useActionState(saveSalesDocAction, null);
  const e = state?.fieldErrors;
  const posted = state?.values;

  const [clientId, setClientId] = useState(posted?.clientId ?? values.clientId);
  // Lines live in state, so they survive a failed save without being re-sent.
  const [lines, setLines] = useState(() => (values.lines.length ? values.lines : [emptyLine]).map((l) => ({ ...l, key: nextKey() })));
  const [discountType, setDiscountType] = useState<DiscountKind>((posted?.discountType as DiscountKind) ?? values.discountType);
  const [discountValue, setDiscountValue] = useState(posted?.discountValue ?? values.discountValue);
  const [showArabic, setShowArabic] = useState(values.lines.some((l) => l.descriptionAr));

  const sites = clients.find((c) => c.id === clientId)?.sites ?? [];
  const v = (name: keyof SalesDocValues) => (posted?.[name] as string | undefined) ?? (values[name] as string);

  const totals = useMemo(() => {
    const parsed = lines.map((l) => ({ quantity: parseQuantity(l.quantity) ?? 0, unitPrice: parseSarToHalalas(l.unitPrice) ?? 0 }));
    const dv = discountType === "PERCENT" ? (parsePercent(discountValue) ?? 0) : discountType === "AMOUNT" ? (parseSarToHalalas(discountValue) ?? 0) : 0;
    return computeTotals({ lines: parsed, discountType, discountValue: dv, vatRate: salesConfig.vatRate });
  }, [lines, discountType, discountValue]);

  const money = (h: number) => formatSar(h, locale);
  const update = (key: string, patch: Partial<LineValues>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const linesJson = JSON.stringify(lines.map(({ description, descriptionAr, quantity, unitPrice }) => ({ description, descriptionAr, quantity, unitPrice })));
  const isInvoice = type === "invoices";
  const overCredit = credit ? totals.total > credit.maxTotal : false;

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="type" value={type} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <input type="hidden" name="lines" value={linesJson} />
      {state?.message ? <Alert tone="error">{state.message}</Alert> : null}

      {credit ? (
        <Card>
          <CardTitle className="mb-1">{t("credit.forInvoice", { number: credit.invoiceNumber })}</CardTitle>
          <p className="mb-4 text-sm text-slate-600">
            {credit.clientName} · {t("credit.maxCredit", { amount: money(credit.maxTotal) })}
          </p>
          <input type="hidden" name="invoiceId" value={credit.invoiceId} />
          <input type="hidden" name="clientId" value={values.clientId} />
          <TextareaField label={t("fields.reason")} name="reason" defaultValue={v("reason")} error={e?.reason} required placeholder={t("credit.reasonPlaceholder")} />
          <p className="mt-2 text-sm text-slate-500">{t("credit.hint")}</p>
        </Card>
      ) : (
      <Card>
        <CardTitle className="mb-4">{t("form.client")}</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("fields.client")} name="clientId" value={clientId} onChange={(ev) => setClientId(ev.target.value)} error={e?.clientId} required>
            <option value="">{t("form.chooseClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {locale === "ar" && c.nameAr ? c.nameAr : c.nameEn}
              </option>
            ))}
          </SelectField>
          <SelectField label={`${t("fields.site")} (${tc("optional")})`} name="siteId" key={clientId} defaultValue={clientId === values.clientId ? v("siteId") : ""} error={e?.siteId} disabled={sites.length === 0}>
            <option value="">{sites.length === 0 ? t("form.noSites") : t("form.noSite")}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          {isInvoice ? null : <Field label={t("fields.issueDate")} name="issueDate" type="date" defaultValue={v("issueDate")} error={e?.issueDate} ltr />}
          <Field
            label={type === "quotations" ? t("fields.validUntil") : t("fields.dueDate")}
            name="dueDate"
            type="date"
            defaultValue={v("dueDate")}
            error={e?.dueDate}
            hint={isInvoice ? t("form.invoiceDateHint") : undefined}
            ltr
          />
        </div>
      </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("form.items")}</CardTitle>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" className="size-5 accent-brand" checked={showArabic} onChange={(ev) => setShowArabic(ev.target.checked)} />
            {t("form.showArabic")}
          </label>
        </div>
        {e?.lines ? <Alert tone="error" className="mb-3">{e.lines}</Alert> : null}
        <ol className="space-y-3">
          {lines.map((l, i) => {
            const err = (f: string) => e?.[`lines.${i}.${f}`];
            const amount = (totals.lineTotals[i] ?? 0) as number;
            return (
              <li key={l.key} className="rounded-lg border border-slate-200 p-3 sm:p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">{t("form.itemNo", { n: i + 1 })}</span>
                  {lines.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t("form.removeItem", { n: i + 1 })}>
                      {tc("remove")}
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-12">
                  <Field
                    id={`line-${l.key}-desc`}
                    label={t("fields.description")}
                    name={`desc-${l.key}`}
                    value={l.description}
                    onChange={(ev) => update(l.key, { description: ev.target.value })}
                    error={err("description")}
                    placeholder={t("form.descriptionPlaceholder")}
                    className="sm:col-span-12"
                    autoComplete="off"
                  />
                  {showArabic ? (
                    <Field
                      id={`line-${l.key}-desc-ar`}
                      label={t("fields.descriptionAr")}
                      name={`desc-ar-${l.key}`}
                      value={l.descriptionAr}
                      onChange={(ev) => update(l.key, { descriptionAr: ev.target.value })}
                      error={err("descriptionAr")}
                      dir="rtl"
                      lang="ar"
                      className="sm:col-span-12"
                      autoComplete="off"
                    />
                  ) : null}
                  <Field
                    id={`line-${l.key}-qty`}
                    label={t("fields.quantity")}
                    name={`qty-${l.key}`}
                    value={l.quantity}
                    onChange={(ev) => update(l.key, { quantity: ev.target.value })}
                    error={err("quantity")}
                    inputMode="decimal"
                    ltr
                    className="sm:col-span-3"
                  />
                  <Field
                    id={`line-${l.key}-price`}
                    label={t("fields.unitPrice")}
                    name={`price-${l.key}`}
                    value={l.unitPrice}
                    onChange={(ev) => update(l.key, { unitPrice: ev.target.value })}
                    error={err("unitPrice")}
                    inputMode="decimal"
                    placeholder="0.00"
                    ltr
                    className="sm:col-span-5"
                  />
                  <div className="space-y-1.5 sm:col-span-4">
                    <span className="block text-sm font-medium text-slate-800">{t("fields.amount")}</span>
                    <output className="flex min-h-11 items-center justify-end rounded-lg bg-slate-50 px-3 font-medium tabular-nums text-slate-900">{money(amount)}</output>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {lines.length < salesConfig.maxLines ? (
          <Button type="button" variant="secondary" className="mt-3 w-full sm:w-auto" onClick={() => setLines((ls) => [...ls, { ...emptyLine, key: nextKey() }])}>
            + {t("form.addItem")}
          </Button>
        ) : null}
      </Card>

      <Card>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2 md:self-start">
            <SelectField label={t("fields.discount")} name="discountType" value={discountType} onChange={(ev) => setDiscountType(ev.target.value as DiscountKind)}>
              <option value="NONE">{t("discount.NONE")}</option>
              <option value="PERCENT">{t("discount.PERCENT")}</option>
              <option value="AMOUNT">{t("discount.AMOUNT")}</option>
            </SelectField>
            {discountType === "NONE" ? null : (
              <Field
                label={discountType === "PERCENT" ? t("fields.discountPercent") : t("fields.discountAmount")}
                name="discountValue"
                value={discountValue}
                onChange={(ev) => setDiscountValue(ev.target.value)}
                error={e?.discountValue}
                inputMode="decimal"
                ltr
              />
            )}
          </div>
          <dl className="space-y-2 text-sm" aria-live="polite">
            <Row label={t("totals.subtotal")} value={money(totals.subtotal)} />
            {totals.discountAmount > 0 ? <Row label={t("totals.discount")} value={`-${money(totals.discountAmount)}`} /> : null}
            <Row label={t("totals.vat", { rate: formatPercent(salesConfig.vatRate) })} value={money(totals.vatAmount)} />
            <Row label={t("totals.total")} value={money(totals.total)} strong />
            {overCredit ? <p className="text-sm text-red-700">{t("credit.tooLarge", { amount: money(credit!.maxTotal) })}</p> : null}
          </dl>
        </div>
      </Card>

      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm" open={!!(v("notes") || v("terms"))}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-lg font-semibold text-slate-900 sm:px-6 [&::-webkit-details-marker]:hidden">
          {t("form.notesTerms")}
          <span aria-hidden className="text-slate-400 transition group-open:rotate-180">
            ▾
          </span>
        </summary>
        <div className="grid gap-4 px-5 pb-6 sm:px-6">
          <TextareaField label={t("fields.notes")} name="notes" defaultValue={v("notes")} error={e?.notes} />
          {credit ? null : <TextareaField label={t("fields.terms")} name="terms" defaultValue={v("terms")} error={e?.terms} />}
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <span className="text-sm text-slate-600 sm:hidden">
          {t("totals.total")}: <strong className="tabular-nums text-slate-900">{money(totals.total)}</strong>
        </span>
        <SubmitButton size="lg" className="sm:w-auto" pendingLabel={tc("saving")}>
          {id ? tc("save") : t(`form.create.${type}`)}
        </SubmitButton>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", strong && "border-t border-slate-200 pt-2 text-base font-semibold text-slate-900")}>
      <dt className={strong ? undefined : "text-slate-600"}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
