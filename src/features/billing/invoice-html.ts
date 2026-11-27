import "server-only";
import QRCode from "qrcode";
import { brand } from "@/config/brand";
import type { BillingCycleCode } from "@/config/plans";
import { documentFontsCss, esc } from "@/features/sales/document-html";
import type { InvoiceParty, SubscriptionInvoiceDetail } from "./service";

/**
 * Subscription tax invoice from the software seller to the customer company, as one
 * self-contained A4 HTML page (browser print view and PDF use the same HTML).
 * Bilingual labels: the chosen language leads, the other follows in smaller type.
 * Buyer with a VAT number: tax invoice; without: simplified tax invoice.
 */
type Lang = "en" | "ar";

const LABELS = {
  taxInvoice: ["Tax Invoice", "فاتورة ضريبية"],
  simplified: ["Simplified Tax Invoice", "فاتورة ضريبية مبسطة"],
  number: ["Invoice No.", "رقم الفاتورة"],
  issuedAt: ["Issue date and time", "تاريخ ووقت الإصدار"],
  seller: ["Seller", "البائع"],
  buyer: ["Buyer", "المشتري"],
  vatNo: ["VAT No.", "الرقم الضريبي"],
  crNo: ["CR No.", "السجل التجاري"],
  description: ["Description", "الوصف"],
  period: ["Service period", "فترة الخدمة"],
  qty: ["Qty", "الكمية"],
  unitPrice: ["Unit price", "سعر الوحدة"],
  amount: ["Amount", "المبلغ"],
  taxable: ["Total excl. VAT", "الإجمالي غير شامل الضريبة"],
  vat: ["VAT", "ضريبة القيمة المضافة"],
  total: ["Total incl. VAT", "الإجمالي شامل الضريبة"],
  paid: ["Paid in full", "مدفوعة بالكامل"],
  amountsIn: ["Amounts in SAR", "المبالغ بالريال السعودي"],
  print: ["Print", "طباعة"],
  pdf: ["Download PDF", "تنزيل PDF"],
  back: ["Back", "رجوع"],
} as const;
type Key = keyof typeof LABELS;

const PLAN_NAMES: Record<string, [string, string]> = {
  STARTER: ["Starter", "الأساسية"],
  PRO: ["Pro", "الاحترافية"],
  BUSINESS: ["Business", "الأعمال"],
};
const CYCLE_NAMES: Record<BillingCycleCode, [string, string]> = {
  MONTHLY: ["Monthly", "شهري"],
  QUARTERLY: ["Quarterly (3 months)", "ربع سنوي (3 أشهر)"],
  YEARLY: ["Yearly (12 months, 2 months free)", "سنوي (12 شهراً، شهران مجاناً)"],
};

function money(halalas: number): string {
  return `${Math.trunc(halalas / 100).toLocaleString("en-US")}.${String(halalas % 100).padStart(2, "0")}`;
}

function riyadh(d: Date, withTime: boolean): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year}${withTime ? ` ${p.hour}:${p.minute}` : ""}`;
}

export interface InvoiceRenderOptions {
  lang: Lang;
  forPdf: boolean;
  pdfHref?: string;
  backHref?: string;
}

export async function renderSubscriptionInvoiceHtml(inv: SubscriptionInvoiceDetail, opts: InvoiceRenderOptions): Promise<string> {
  const lead = opts.lang === "en" ? 0 : 1;
  const other = 1 - lead;
  const L = (k: Key) => `<span class="l1">${esc(LABELS[k][lead])}</span> <span class="l2">${esc(LABELS[k][other])}</span>`;
  const titleKey: Key = inv.buyer.vatNumber ? "taxInvoice" : "simplified";
  const qrSvg = await QRCode.toString(inv.qrPayload, { type: "svg", errorCorrectionLevel: "M", margin: 0 });

  const party = (p: InvoiceParty) => {
    const [n1, n2] = opts.lang === "ar" && p.nameAr ? [p.nameAr, p.nameEn] : [p.nameEn, p.nameAr];
    const addr = [p.addressLine, [p.city, p.postalCode].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>");
    return `<div class="name">${esc(n1)}</div>${n2 ? `<div class="muted">${esc(n2)}</div>` : ""}${addr ? `<div class="muted">${addr}</div>` : ""}
${p.vatNumber ? `<div class="kv"><span class="k">${L("vatNo")}</span><span class="v num">${esc(p.vatNumber)}</span></div>` : ""}
${p.crNumber ? `<div class="kv"><span class="k">${L("crNo")}</span><span class="v num">${esc(p.crNumber)}</span></div>` : ""}`;
  };

  const plan = PLAN_NAMES[inv.planCode] ?? [inv.planCode, inv.planCode];
  const cycle = CYCLE_NAMES[inv.billingCycle as BillingCycleCode];
  const desc1 = opts.lang === "ar" ? `اشتراك ${brand.productName} – باقة ${plan[1]}، ${cycle[1]}` : `${brand.productName} subscription – ${plan[0]} plan, ${cycle[0]}`;
  const desc2 = opts.lang === "ar" ? `${brand.productName} subscription – ${plan[0]} plan, ${cycle[0]}` : `اشتراك ${brand.productName} – باقة ${plan[1]}، ${cycle[1]}`;
  const vatPct = (inv.vatRate / 100).toString();

  const toolbar = opts.forPdf
    ? ""
    : `<div class="toolbar">${opts.backHref ? `<a class="btn ghost" href="${esc(opts.backHref)}">${esc(LABELS.back[lead])}</a>` : ""}<span class="grow"></span><button class="btn" type="button" onclick="window.print()">${esc(LABELS.print[lead])}</button>${opts.pdfHref ? `<a class="btn primary" href="${esc(opts.pdfHref)}">${esc(LABELS.pdf[lead])}</a>` : ""}</div>`;

  return `<!doctype html>
<html lang="${opts.lang}" dir="${opts.lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(`${LABELS[titleKey][lead]} ${inv.number}`)}</title>
<style>
${documentFontsCss(opts.forPdf)}
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Inter", "Plex Arabic", system-ui, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #0f172a; background: #f1f5f9; }
body[dir="rtl"] { font-family: "Plex Arabic", "Inter", system-ui, sans-serif; }
.page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 14mm 12mm; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.l2 { font-size: .8em; color: #64748b; font-weight: 400; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid ${brand.colors.accent}; }
.head h1 { margin: 0; font-size: 17pt; color: ${brand.colors.accent}; line-height: 1.2; }
.head h1 .l2 { display: block; font-size: 11pt; color: #334155; font-weight: 600; }
.paid { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 4px; background: #dcfce7; color: #166534; font-size: 9pt; font-weight: 600; }
.name { font-size: 12pt; font-weight: 600; }
.muted { color: #475569; font-size: 9.5pt; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
.box h3 { margin: 0 0 6px; font-size: 9pt; text-transform: uppercase; letter-spacing: .03em; color: ${brand.colors.accent}; }
.box h3 .l2 { text-transform: none; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.kv .k { color: #475569; font-size: 9pt; }
.kv .v { font-weight: 600; text-align: end; }
table.lines { width: 100%; border-collapse: collapse; }
table.lines th { background: #f1f5f9; font-size: 8.5pt; font-weight: 600; text-align: start; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
table.lines td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.c-num { text-align: end !important; white-space: nowrap; }
.sub { color: #64748b; font-size: 9pt; }
.bottom { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; margin-top: 12px; }
.qr { width: 34mm; height: 34mm; flex: none; }
.qr svg { width: 100%; height: 100%; }
table.totals { min-width: 85mm; border-collapse: collapse; margin-inline-start: auto; }
table.totals th { text-align: start; font-weight: 400; padding: 4px 8px; color: #334155; }
table.totals td { text-align: end; padding: 4px 8px; white-space: nowrap; }
table.totals tr.grand th, table.totals tr.grand td { font-weight: 700; font-size: 11.5pt; border-top: 2px solid #0f172a; padding-top: 6px; color: #0f172a; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 8pt; }
.toolbar { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.toolbar .grow { flex: 1; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; }
.btn.primary { background: ${brand.colors.accent}; border-color: ${brand.colors.accent}; color: #fff; }
.btn.ghost { border-color: transparent; }
@media screen and (max-width: 820px) { .page { width: auto; min-height: 0; margin: 0; padding: 16px; box-shadow: none; } .grid { grid-template-columns: 1fr; } .head { flex-direction: column; } }
@media print { body { background: #fff; } .toolbar { display: none; } .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } }
</style>
</head>
<body dir="${opts.lang === "ar" ? "rtl" : "ltr"}">
${toolbar}
<main class="page">
  <header class="head">
    <div>${party(inv.seller)}</div>
    <div style="text-align:end"><h1>${L(titleKey)}</h1><div class="paid">${L("paid")}</div></div>
  </header>
  <section class="grid">
    <div class="box"><h3>${L("buyer")}</h3>${party(inv.buyer)}</div>
    <div class="box">
      <div class="kv"><span class="k">${L("number")}</span><span class="v num">${esc(inv.number)}</span></div>
      <div class="kv"><span class="k">${L("issuedAt")}</span><span class="v num">${esc(riyadh(inv.issuedAt, true))}</span></div>
      <div class="kv"><span class="k">${L("period")}</span><span class="v num">${esc(riyadh(inv.periodStart, false))} – ${esc(riyadh(inv.periodEnd, false))}</span></div>
    </div>
  </section>
  <table class="lines">
    <thead><tr><th>${L("description")}</th><th class="c-num">${L("qty")}</th><th class="c-num">${L("unitPrice")}</th><th class="c-num">${L("amount")}</th></tr></thead>
    <tbody><tr>
      <td><div>${esc(desc1)}</div><div class="sub">${esc(desc2)}</div><div class="sub"><span class="num">${esc(riyadh(inv.periodStart, false))} – ${esc(riyadh(inv.periodEnd, false))}</span></div></td>
      <td class="c-num num">1</td>
      <td class="c-num num">${money(inv.subtotal)}</td>
      <td class="c-num num">${money(inv.subtotal)}</td>
    </tr></tbody>
  </table>
  <section class="bottom">
    <div class="qr" aria-label="ZATCA QR">${qrSvg}</div>
    <table class="totals"><tbody>
      <tr><th>${L("taxable")}</th><td class="num">${money(inv.subtotal)}</td></tr>
      <tr><th>${L("vat")} <span class="num">${esc(vatPct)}%</span></th><td class="num">${money(inv.vatAmount)}</td></tr>
      <tr class="grand"><th>${L("total")}</th><td class="num">${money(inv.total)}</td></tr>
    </tbody></table>
  </section>
  <footer class="foot"><span>${L("amountsIn")}</span><span>${esc(brand.productName)}</span></footer>
</main>
</body>
</html>`;
}
