import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { brand } from "@/config/brand";
import type { SalesDocDetail } from "./service";
import { invoiceKind, invoiceQr } from "./document-data";
import { formatPercent, formatQuantity } from "./totals";

/**
 * Printable A4 document (quotation, proforma, tax invoice) as one HTML string.
 * The same HTML is shown in the browser for printing and turned into a PDF by
 * Chromium, so both always match. Labels are bilingual: the chosen language
 * leads and the other one follows in smaller type. Every value is escaped.
 */

export type DocLang = "en" | "ar";

const LABELS = {
  quotation: ["Quotation", "عرض سعر"],
  proforma: ["Proforma Invoice", "فاتورة مبدئية"],
  taxInvoice: ["Tax Invoice", "فاتورة ضريبية"],
  simplifiedTaxInvoice: ["Simplified Tax Invoice", "فاتورة ضريبية مبسطة"],
  draftInvoice: ["Draft – not a tax invoice", "مسودة – ليست فاتورة ضريبية"],
  creditNote: ["Credit Note", "إشعار دائن"],
  draftCredit: ["Draft – not a credit note", "مسودة – ليست إشعاراً دائناً"],
  originalInvoice: ["Original invoice", "الفاتورة الأصلية"],
  invoiceDate: ["Invoice date", "تاريخ الفاتورة"],
  reason: ["Reason", "السبب"],
  credited: ["Credit notes", "الإشعارات الدائنة"],
  number: ["No.", "الرقم"],
  date: ["Date", "التاريخ"],
  issuedAt: ["Issue date and time", "تاريخ ووقت الإصدار"],
  dueDate: ["Due date", "تاريخ الاستحقاق"],
  validUntil: ["Valid until", "صالح حتى"],
  seller: ["Seller", "البائع"],
  billTo: ["Bill to", "العميل"],
  vatNo: ["VAT No.", "الرقم الضريبي"],
  crNo: ["CR No.", "السجل التجاري"],
  site: ["Site", "الموقع"],
  reference: ["Reference", "المرجع"],
  description: ["Description", "الوصف"],
  qty: ["Qty", "الكمية"],
  unitPrice: ["Unit price", "سعر الوحدة"],
  amount: ["Amount", "المبلغ"],
  subtotal: ["Subtotal", "المجموع"],
  discount: ["Discount", "الخصم"],
  taxable: ["Total excl. VAT", "الإجمالي غير شامل الضريبة"],
  vat: ["VAT", "ضريبة القيمة المضافة"],
  total: ["Total incl. VAT", "الإجمالي شامل الضريبة"],
  paid: ["Paid", "المدفوع"],
  balance: ["Balance due", "المبلغ المستحق"],
  notes: ["Notes", "ملاحظات"],
  terms: ["Terms", "الشروط"],
  bank: ["Bank details", "البيانات البنكية"],
  iban: ["IBAN", "رقم الآيبان"],
  accountName: ["Account name", "اسم الحساب"],
  amountsIn: ["Amounts in SAR", "المبالغ بالريال السعودي"],
  print: ["Print", "طباعة"],
  pdf: ["Download PDF", "تنزيل PDF"],
  back: ["Back", "رجوع"],
} as const;

type LabelKey = keyof typeof LABELS;

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONT_FILES = {
  inter: "inter-latin-wght-normal.woff2",
  plexArabic400: "ibm-plex-sans-arabic-arabic-400-normal.woff2",
  plexArabic600: "ibm-plex-sans-arabic-arabic-600-normal.woff2",
} as const;

const fontCache = new Map<string, string>();

/** Fonts as data URIs (for PDFs, where Chromium must not depend on installed fonts) or as public URLs. */
function fontSrc(file: string, inline: boolean): string {
  if (!inline) return `/fonts/${file}`;
  let data = fontCache.get(file);
  if (!data) {
    data = `data:font/woff2;base64,${readFileSync(path.join(process.cwd(), "public", "fonts", file)).toString("base64")}`;
    fontCache.set(file, data);
  }
  return data;
}

function money(halalas: number): string {
  const sign = halalas < 0 ? "-" : "";
  const abs = Math.abs(halalas);
  const whole = Math.trunc(abs / 100).toLocaleString("en-US");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** dd/mm/yyyy for a date-only value (stored as UTC midnight). */
function dateOnly(d: Date | null): string {
  if (!d) return "";
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** dd/mm/yyyy hh:mm in Saudi time. */
function dateTime(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** @font-face rules for Inter and IBM Plex Sans Arabic (embedded for PDFs). Shared by all printable documents. */
export function documentFontsCss(inline: boolean): string {
  return `@font-face { font-family: "Inter"; src: url("${fontSrc(FONT_FILES.inter, inline)}") format("woff2"); font-weight: 100 900; }
@font-face { font-family: "Plex Arabic"; src: url("${fontSrc(FONT_FILES.plexArabic400, inline)}") format("woff2"); font-weight: 400; unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }
@font-face { font-family: "Plex Arabic"; src: url("${fontSrc(FONT_FILES.plexArabic600, inline)}") format("woff2"); font-weight: 600; unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F; }`;
}

export interface RenderOptions {
  lang: DocLang;
  /** True for the PDF: embed fonts, no toolbar. */
  forPdf: boolean;
  logoDataUri: string | null;
  /** Toolbar links (browser view only). */
  pdfHref?: string;
  backHref?: string;
}

export async function renderSalesDocHtml(doc: SalesDocDetail, opts: RenderOptions): Promise<string> {
  const { lang } = opts;
  const lead = lang === "en" ? 0 : 1;
  const other = 1 - lead;
  /** Bilingual label: leading language, then the other one smaller. */
  const L = (key: LabelKey) => `<span class="l1">${esc(LABELS[key][lead])}</span><span class="l2">${esc(LABELS[key][other])}</span>`;
  const one = (key: LabelKey) => esc(LABELS[key][lead]);

  const seller = doc.seller;
  const buyer = doc.buyer;
  const isInvoice = doc.type === "INVOICE";
  const isCredit = doc.type === "CREDIT_NOTE";
  const isTax = isInvoice || isCredit;
  const issued = isTax && doc.status === "SENT";
  const titleKey: LabelKey =
    doc.type === "QUOTATION"
      ? "quotation"
      : doc.type === "PROFORMA"
        ? "proforma"
        : isCredit
          ? "creditNote"
          : invoiceKind(buyer) === "standard"
            ? "taxInvoice"
            : "simplifiedTaxInvoice";

  const qrPayload = invoiceQr(doc);
  const qrSvg = qrPayload ? await QRCode.toString(qrPayload, { type: "svg", errorCorrectionLevel: "M", margin: 0 }) : "";

  const name = (en: string, ar: string | null) =>
    lang === "ar" && ar ? `<div class="name" dir="rtl">${esc(ar)}</div><div class="name2">${esc(en)}</div>` : `<div class="name">${esc(en)}</div>${ar ? `<div class="name2" dir="rtl">${esc(ar)}</div>` : ""}`;
  const address = (a: { addressLine: string | null; city: string | null; postalCode: string | null }) =>
    [a.addressLine, [a.city, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).map(esc).join("<br>");
  const idRow = (key: LabelKey, value: string | null) => (value ? `<div class="kv"><span class="k">${L(key)}</span><span class="v num">${esc(value)}</span></div>` : "");

  const meta: string[] = [];
  if (doc.number) meta.push(`<div class="kv"><span class="k">${L("number")}</span><span class="v num">${esc(doc.number)}</span></div>`);
  if (issued && doc.issuedAt) meta.push(`<div class="kv"><span class="k">${L("issuedAt")}</span><span class="v num">${esc(dateTime(doc.issuedAt))}</span></div>`);
  else meta.push(`<div class="kv"><span class="k">${L("date")}</span><span class="v num">${esc(dateOnly(doc.issueDate))}</span></div>`);
  if (doc.dueDate && !isCredit) meta.push(`<div class="kv"><span class="k">${L(doc.type === "QUOTATION" ? "validUntil" : "dueDate")}</span><span class="v num">${esc(dateOnly(doc.dueDate))}</span></div>`);
  if (doc.creditedInvoice?.number) {
    meta.push(`<div class="kv"><span class="k">${L("originalInvoice")}</span><span class="v num">${esc(doc.creditedInvoice.number)}</span></div>`);
    meta.push(`<div class="kv"><span class="k">${L("invoiceDate")}</span><span class="v num">${esc(doc.creditedInvoice.issuedAt ? dateTime(doc.creditedInvoice.issuedAt) : dateOnly(doc.creditedInvoice.issueDate))}</span></div>`);
  }
  if (doc.source?.number) meta.push(`<div class="kv"><span class="k">${L("reference")}</span><span class="v num">${esc(doc.source.number)}</span></div>`);

  const rows = doc.lines
    .map((l, i) => {
      const [d1, d2] = lang === "ar" && l.descriptionAr ? [l.descriptionAr, l.description] : [l.description, l.descriptionAr];
      return `<tr>
  <td class="c-no num">${i + 1}</td>
  <td class="c-desc"><div>${esc(d1)}</div>${d2 ? `<div class="sub">${esc(d2)}</div>` : ""}</td>
  <td class="c-num num">${esc(formatQuantity(l.quantity))}</td>
  <td class="c-num num">${esc(money(l.unitPrice))}</td>
  <td class="c-num num">${esc(money(l.lineTotal))}</td>
</tr>`;
    })
    .join("\n");

  const vatPct = formatPercent(doc.vatRate);
  const totals = [
    `<tr><th>${L("subtotal")}</th><td class="num">${money(doc.subtotal)}</td></tr>`,
    doc.discountAmount > 0
      ? `<tr><th>${L("discount")}${doc.discountType === "PERCENT" ? ` <span class="num">(${esc(formatPercent(doc.discountValue))}%)</span>` : ""}</th><td class="num">-${money(doc.discountAmount)}</td></tr><tr><th>${L("taxable")}</th><td class="num">${money(doc.taxableAmount)}</td></tr>`
      : "",
    `<tr><th>${L("vat")} <span class="num">${esc(vatPct)}%</span></th><td class="num">${money(doc.vatAmount)}</td></tr>`,
    `<tr class="grand"><th>${L("total")}</th><td class="num">${money(doc.total)}</td></tr>`,
    isInvoice && issued && doc.creditedAmount > 0 ? `<tr><th>${L("credited")}</th><td class="num">-${money(doc.creditedAmount)}</td></tr>` : "",
    isInvoice && issued && doc.paidAmount > 0 ? `<tr><th>${L("paid")}</th><td class="num">${money(doc.paidAmount)}</td></tr>` : "",
    isInvoice && issued && (doc.paidAmount > 0 || doc.creditedAmount > 0) ? `<tr class="balance"><th>${L("balance")}</th><td class="num">${money(doc.balance)}</td></tr>` : "",
  ].join("");

  const bank =
    doc.type !== "QUOTATION" && !isCredit && seller.iban
      ? `<div class="box"><h3>${L("bank")}</h3>${seller.bankName ? `<div>${esc(seller.bankName)}</div>` : ""}${seller.bankAccountName ? `<div class="kv"><span class="k">${L("accountName")}</span><span class="v">${esc(seller.bankAccountName)}</span></div>` : ""}<div class="kv"><span class="k">${L("iban")}</span><span class="v num">${esc(seller.iban)}</span></div></div>`
      : "";
  const notes = [isCredit && doc.reason ? `<div class="box"><h3>${L("reason")}</h3><p>${esc(doc.reason)}</p></div>` : "", doc.notes ? `<div class="box"><h3>${L("notes")}</h3><p>${esc(doc.notes)}</p></div>` : "", doc.terms ? `<div class="box"><h3>${L("terms")}</h3><p>${esc(doc.terms)}</p></div>` : ""].join("");

  const toolbar = opts.forPdf
    ? ""
    : `<div class="toolbar">
  ${opts.backHref ? `<a class="btn ghost" href="${esc(opts.backHref)}">${one("back")}</a>` : ""}
  <span class="grow"></span>
  <button class="btn" type="button" onclick="window.print()">${one("print")}</button>
  ${opts.pdfHref ? `<a class="btn primary" href="${esc(opts.pdfHref)}">${one("pdf")}</a>` : ""}
</div>`;

  const inline = opts.forPdf;
  const title = `${LABELS[titleKey][lead]}${doc.number ? ` ${doc.number}` : ""}`;

  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
${documentFontsCss(inline)}
@page { size: A4; margin: 14mm 12mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Inter", "Plex Arabic", system-ui, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #0f172a; background: #f1f5f9; }
[lang="ar"] body, body[dir="rtl"] { font-family: "Plex Arabic", "Inter", system-ui, sans-serif; }
.page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 14mm 12mm; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.l1 { display: block; }
.l2 { display: block; font-size: .78em; color: #64748b; font-weight: 400; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 12px; border-bottom: 2px solid ${brand.colors.accent}; }
.seller { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
.seller img { max-width: 34mm; max-height: 20mm; object-fit: contain; }
.name { font-size: 13pt; font-weight: 600; }
.name2 { color: #475569; }
.muted { color: #475569; font-size: 9.5pt; }
.title { text-align: end; }
.title h1 { margin: 0; font-size: 17pt; font-weight: 700; color: ${brand.colors.accent}; line-height: 1.2; }
.title h1 .l2 { font-size: 11pt; color: #334155; font-weight: 600; }
.draft { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 9pt; font-weight: 600; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
.box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; break-inside: avoid; }
.box h3 { margin: 0 0 6px; font-size: 9pt; text-transform: uppercase; letter-spacing: .03em; color: ${brand.colors.accent}; }
.box h3 .l2 { display: inline; margin-inline-start: 6px; text-transform: none; }
.box p { margin: 0; white-space: pre-line; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.kv .k { color: #475569; font-size: 9pt; }
.kv .k .l2 { display: inline; margin-inline-start: 4px; }
.kv .k .l1, table.totals th .l1, .box h3 .l1 { display: inline; }
.kv .v { font-weight: 600; text-align: end; }
table.lines { width: 100%; border-collapse: collapse; margin-top: 4px; }
table.lines th { background: #f1f5f9; font-size: 8.5pt; font-weight: 600; text-align: start; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
table.lines td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
table.lines tr { break-inside: avoid; }
.c-no { width: 7mm; color: #64748b; }
.c-num { text-align: end; white-space: nowrap; }
table.lines th.c-num { text-align: end; }
.sub { color: #64748b; font-size: 9pt; }
.bottom { display: flex; gap: 16px; justify-content: space-between; align-items: flex-start; margin-top: 12px; break-inside: avoid; }
.qr { width: 34mm; height: 34mm; flex: none; }
.qr svg { width: 100%; height: 100%; }
table.totals { min-width: 85mm; border-collapse: collapse; margin-inline-start: auto; }
table.totals th { text-align: start; font-weight: 400; padding: 4px 8px; color: #334155; }
table.totals th .l2 { display: inline; margin-inline-start: 6px; }
table.totals td { text-align: end; padding: 4px 8px; white-space: nowrap; }
table.totals tr.grand th, table.totals tr.grand td { font-weight: 700; font-size: 11.5pt; color: #0f172a; border-top: 2px solid #0f172a; padding-top: 6px; }
table.totals tr.balance th, table.totals tr.balance td { font-weight: 700; }
.extra { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.foot { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 8pt; }
.toolbar { position: sticky; top: 0; z-index: 1; display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; font-family: inherit; }
.toolbar .grow { flex: 1; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; }
.btn.primary { background: ${brand.colors.accent}; border-color: ${brand.colors.accent}; color: #fff; }
.btn.ghost { border-color: transparent; }
.btn:focus-visible { outline: 3px solid ${brand.colors.accent}55; outline-offset: 2px; }
@media screen and (max-width: 820px) { .page { width: auto; min-height: 0; margin: 0; padding: 16px; box-shadow: none; } .parties, .extra { grid-template-columns: 1fr; } .head { flex-direction: column; } .title { text-align: start; } }
@media print { body { background: #fff; } .toolbar { display: none; } .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } }
</style>
</head>
<body dir="${lang === "ar" ? "rtl" : "ltr"}">
${toolbar}
<main class="page">
  <header class="head">
    <div class="seller">
      ${opts.logoDataUri ? `<img src="${esc(opts.logoDataUri)}" alt="">` : ""}
      <div>
        ${name(seller.nameEn, seller.nameAr)}
        <div class="muted">${address(seller)}</div>
        ${seller.vatNumber ? `<div class="muted">${one("vatNo")}: <span class="num">${esc(seller.vatNumber)}</span></div>` : ""}
        ${seller.crNumber ? `<div class="muted">${one("crNo")}: <span class="num">${esc(seller.crNumber)}</span></div>` : ""}
      </div>
    </div>
    <div class="title">
      <h1>${L(titleKey)}</h1>
      ${isTax && !issued ? `<div class="draft">${esc(LABELS[isCredit ? "draftCredit" : "draftInvoice"][lead])}</div>` : ""}
    </div>
  </header>

  <section class="parties">
    <div class="box">
      <h3>${L("billTo")}</h3>
      ${name(buyer.nameEn, buyer.nameAr)}
      <div class="muted">${address(buyer)}</div>
      ${idRow("vatNo", buyer.vatNumber)}
      ${idRow("crNo", buyer.crNumber)}
      ${doc.site ? `<div class="kv"><span class="k">${L("site")}</span><span class="v">${esc(doc.site.name)}</span></div>` : ""}
    </div>
    <div class="box">${meta.join("")}</div>
  </section>

  <table class="lines">
    <thead><tr>
      <th class="c-no">#</th>
      <th>${L("description")}</th>
      <th class="c-num">${L("qty")}</th>
      <th class="c-num">${L("unitPrice")}</th>
      <th class="c-num">${L("amount")}</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <section class="bottom">
    ${qrSvg ? `<div class="qr" aria-label="ZATCA QR">${qrSvg}</div>` : "<div></div>"}
    <table class="totals"><tbody>${totals}</tbody></table>
  </section>

  ${bank || notes ? `<section class="extra">${bank}${notes}</section>` : ""}

  <footer class="foot">
    <span>${L("amountsIn")}</span>
    <span>Powered by ${esc(brand.umbrellaName)}</span>
  </footer>
</main>
</body>
</html>`;
}
