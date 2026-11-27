import "server-only";
import { brand } from "@/config/brand";
import { documentFontsCss, esc } from "@/features/sales/document-html";
import { formatPercent, formatQuantity } from "@/features/sales/totals";
import { effectiveMonthDays } from "./calc";
import type { SalaryLine, SalarySheetDetail } from "./service";

/**
 * Printable salary sheet (A4 landscape, grouped by site) and payslips (one A4 page per
 * worker). The same HTML is shown for printing and turned into a PDF by Chromium.
 * Labels are bilingual: the chosen language leads. Every value is escaped.
 */

export type DocLang = "en" | "ar";

const LABELS = {
  salarySheet: ["Salary sheet", "مسير الرواتب"],
  payslip: ["Payslip", "قسيمة الراتب"],
  month: ["Month", "الشهر"],
  site: ["Site", "الموقع"],
  allSites: ["All sites", "كل المواقع"],
  noSite: ["No site", "بدون موقع"],
  status: ["Status", "الحالة"],
  draft: ["Draft – not approved", "مسودة – غير معتمد"],
  approved: ["Approved", "معتمد"],
  payDate: ["Pay date", "تاريخ الصرف"],
  name: ["Name", "الاسم"],
  iqama: ["Iqama", "الإقامة"],
  jobTitle: ["Job title", "المهنة"],
  basic: ["Basic", "الأساسي"],
  allowances: ["Allowances", "البدلات"],
  housing: ["Housing allowance", "بدل السكن"],
  transport: ["Transport allowance", "بدل النقل"],
  other: ["Other allowance", "بدلات أخرى"],
  gross: ["Gross", "الإجمالي"],
  absentDays: ["Absent days", "أيام الغياب"],
  absence: ["Absence deduction", "خصم الغياب"],
  otHours: ["OT hours", "ساعات إضافية"],
  overtime: ["Overtime", "العمل الإضافي"],
  additions: ["Additions", "إضافات"],
  advances: ["Advances", "السلف"],
  deductions: ["Deductions", "خصومات"],
  otherDeductions: ["Other deductions", "خصومات أخرى"],
  net: ["Net pay", "صافي الراتب"],
  signature: ["Signature", "التوقيع"],
  subtotal: ["Subtotal", "المجموع الفرعي"],
  total: ["Total", "الإجمالي"],
  workers: ["Workers", "العمال"],
  earnings: ["Earnings", "الاستحقاقات"],
  deductionsTitle: ["Deductions", "الاستقطاعات"],
  totalEarnings: ["Total earnings", "إجمالي الاستحقاقات"],
  totalDeductions: ["Total deductions", "إجمالي الاستقطاعات"],
  notes: ["Notes", "ملاحظات"],
  rules: ["Rules used", "القواعد المستخدمة"],
  employer: ["For the employer", "عن صاحب العمل"],
  received: ["Received by the worker", "استلمه العامل"],
  amountsIn: ["Amounts in SAR", "المبالغ بالريال السعودي"],
  print: ["Print", "طباعة"],
  pdf: ["Download PDF", "تنزيل PDF"],
  back: ["Back", "رجوع"],
  days: ["days", "يوم"],
  hours: ["hours", "ساعة"],
} as const;
type LabelKey = keyof typeof LABELS;

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

export function monthLabel(year: number, month: number, lang: DocLang) {
  return `${MONTHS[lang][month - 1]} ${year}`;
}

function money(halalas: number): string {
  const sign = halalas < 0 ? "-" : "";
  const abs = Math.abs(halalas);
  return `${sign}${Math.trunc(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

function dateOnly(d: Date | null): string {
  if (!d) return "";
  const iso = d.toISOString();
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export interface Company {
  nameEn: string;
  nameAr: string | null;
  crNumber: string | null;
  addressLine: string | null;
  city: string | null;
}

export interface PayrollRenderOptions {
  lang: DocLang;
  forPdf: boolean;
  logoDataUri: string | null;
  pdfHref?: string;
  backHref?: string;
}

function labels(lang: DocLang) {
  const lead = lang === "en" ? 0 : 1;
  const other = 1 - lead;
  return {
    /** Bilingual label: leading language, then the other one smaller. */
    L: (key: LabelKey) => `<span class="l1">${esc(LABELS[key][lead])}</span><span class="l2">${esc(LABELS[key][other])}</span>`,
    one: (key: LabelKey) => esc(LABELS[key][lead]),
  };
}

function shell(opts: PayrollRenderOptions, title: string, pageCss: string, body: string) {
  const { one } = labels(opts.lang);
  const toolbar = opts.forPdf
    ? ""
    : `<div class="toolbar">
  ${opts.backHref ? `<a class="btn ghost" href="${esc(opts.backHref)}">${one("back")}</a>` : ""}
  <span class="grow"></span>
  <button class="btn" type="button" onclick="window.print()">${one("print")}</button>
  ${opts.pdfHref ? `<a class="btn primary" href="${esc(opts.pdfHref)}">${one("pdf")}</a>` : ""}
</div>`;
  const dir = opts.lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html>
<html lang="${opts.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
${documentFontsCss(opts.forPdf)}
${pageCss}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: "Inter", "Plex Arabic", system-ui, sans-serif; color: #0f172a; background: #f1f5f9; line-height: 1.4; }
body[dir="rtl"] { font-family: "Plex Arabic", "Inter", system-ui, sans-serif; }
.num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: isolate; }
.l1 { display: block; }
.l2 { display: block; font-size: .8em; color: #64748b; font-weight: 400; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 10px; border-bottom: 2px solid ${brand.colors.accent}; }
.company { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
.company img { max-width: 30mm; max-height: 16mm; object-fit: contain; }
.cname { font-size: 13pt; font-weight: 600; }
.muted { color: #475569; font-size: 9pt; }
.title { text-align: end; }
.title h1 { margin: 0; font-size: 16pt; color: ${brand.colors.accent}; line-height: 1.2; }
.title h1 .l2 { font-size: 10.5pt; color: #334155; font-weight: 600; }
.pill { display: inline-block; margin-top: 6px; padding: 2px 8px; border-radius: 4px; font-size: 8.5pt; font-weight: 600; }
.pill.draft { background: #fef3c7; color: #92400e; }
.pill.ok { background: #d1fae5; color: #065f46; }
.kv { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
.kv .k { color: #475569; }
.kv .k .l1, .kv .k .l2 { display: inline; }
.kv .k .l2 { margin-inline-start: 4px; }
.kv .v { font-weight: 600; text-align: end; }
.foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; color: #94a3b8; font-size: 8pt; }
.toolbar { position: sticky; top: 0; z-index: 1; display: flex; gap: 8px; align-items: center; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
.toolbar .grow { flex: 1; }
.btn { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: #0f172a; font: inherit; font-weight: 500; text-decoration: none; cursor: pointer; }
.btn.primary { background: ${brand.colors.accent}; border-color: ${brand.colors.accent}; color: #fff; }
.btn.ghost { border-color: transparent; }
.btn:focus-visible { outline: 3px solid ${brand.colors.accent}55; outline-offset: 2px; }
@media print { body { background: #fff; } .toolbar { display: none; } .page { margin: 0 !important; padding: 0 !important; box-shadow: none !important; width: auto !important; min-height: 0 !important; } }
</style>
</head>
<body dir="${dir}">
${toolbar}
${body}
</body>
</html>`;
}

function companyBlock(company: Company, opts: PayrollRenderOptions) {
  const ar = opts.lang === "ar" && company.nameAr;
  const name = ar ? `<div class="cname" dir="rtl">${esc(company.nameAr)}</div><div class="muted">${esc(company.nameEn)}</div>` : `<div class="cname">${esc(company.nameEn)}</div>${company.nameAr ? `<div class="muted" dir="rtl">${esc(company.nameAr)}</div>` : ""}`;
  const address = [company.addressLine, company.city].filter(Boolean).map(esc).join(", ");
  return `<div class="company">${opts.logoDataUri ? `<img src="${esc(opts.logoDataUri)}" alt="">` : ""}<div>${name}${address ? `<div class="muted">${address}</div>` : ""}${company.crNumber ? `<div class="muted">CR: <span class="num">${esc(company.crNumber)}</span></div>` : ""}</div></div>`;
}

function workerName(line: SalaryLine, lang: DocLang) {
  return lang === "ar" && line.workerNameAr ? line.workerNameAr : line.workerName;
}

function siteHeading(line: SalaryLine, lang: DocLang) {
  return line.siteName ?? LABELS.noSite[lang === "en" ? 0 : 1];
}

const allowances = (l: SalaryLine) => l.housingAllowance + l.transportAllowance + l.otherAllowance;

// ---------------------------------------------------------------- salary sheet

export function renderSalarySheetHtml(sheet: SalarySheetDetail, company: Company, opts: PayrollRenderOptions): string {
  const { lang } = opts;
  const { L, one } = labels(lang);
  const period = monthLabel(sheet.year, sheet.month, lang);

  // Lines are sorted by site, then name. Subtotal per site so each site can be paid and checked on its own.
  const groups: { site: string; lines: SalaryLine[] }[] = [];
  for (const line of sheet.lines) {
    const site = siteHeading(line, lang);
    const last = groups.at(-1);
    if (last && last.site === site) last.lines.push(line);
    else groups.push({ site, lines: [line] });
  }
  const cols = 14;
  const sumRow = (label: string, lines: SalaryLine[], cls: string) => {
    const s = (f: (l: SalaryLine) => number) => money(lines.reduce((a, l) => a + f(l), 0));
    return `<tr class="${cls}"><td colspan="3">${label}</td>
<td class="n num">${s((l) => l.basicSalary)}</td><td class="n num">${s(allowances)}</td><td class="n num">${s((l) => l.grossSalary)}</td>
<td></td><td class="n num">${s((l) => l.absenceDeduction)}</td><td></td><td class="n num">${s((l) => l.overtimePay)}</td>
<td class="n num">${s((l) => l.additions)}</td><td class="n num">${s((l) => l.advances + l.deductions)}</td><td class="n num">${s((l) => l.netPay)}</td><td></td></tr>`;
  };
  let index = 0;
  const body = groups
    .map((g) => {
      const rows = g.lines
        .map((l) => {
          index += 1;
          return `<tr>
<td class="c-no num">${index}</td>
<td><div>${esc(workerName(l, lang))}</div>${l.jobTitle ? `<div class="sub">${esc(l.jobTitle)}</div>` : ""}${l.notes ? `<div class="sub">${esc(l.notes)}</div>` : ""}</td>
<td class="num">•••• ${esc(l.iqamaLast4)}</td>
<td class="n num">${money(l.basicSalary)}</td>
<td class="n num">${money(allowances(l))}</td>
<td class="n num">${money(l.grossSalary)}</td>
<td class="n num">${l.absentDays ? esc(formatQuantity(l.absentDays)) : ""}</td>
<td class="n num">${l.absenceDeduction ? money(l.absenceDeduction) : ""}</td>
<td class="n num">${l.overtimeHours ? esc(formatQuantity(l.overtimeHours)) : ""}</td>
<td class="n num">${l.overtimePay ? money(l.overtimePay) : ""}</td>
<td class="n num">${l.additions ? money(l.additions) : ""}</td>
<td class="n num">${l.advances + l.deductions ? money(l.advances + l.deductions) : ""}</td>
<td class="n num strong">${money(l.netPay)}</td>
<td class="sign"></td>
</tr>`;
        })
        .join("\n");
      const header = groups.length > 1 || g.lines[0]?.siteName ? `<tr class="group"><td colspan="${cols}">${esc(g.site)}</td></tr>` : "";
      const subtotal = groups.length > 1 ? sumRow(`${one("subtotal")} · ${esc(g.site)}`, g.lines, "subtotal") : "";
      return header + rows + subtotal;
    })
    .join("\n");

  const status = sheet.status === "APPROVED" ? `<span class="pill ok">${one("approved")}${sheet.payDate ? ` · ${one("payDate")}: <span class="num">${dateOnly(sheet.payDate)}</span>` : ""}</span>` : `<span class="pill draft">${one("draft")}</span>`;
  const days = effectiveMonthDays(sheet, sheet.year, sheet.month);
  const rulesText =
    lang === "ar"
      ? `الشهر = ${days} يوم، ${sheet.hoursPerDay} ساعات في اليوم. العمل الإضافي: أجر الساعة (${sheet.overtimeBase === "GROSS" ? "الإجمالي" : "الأساسي"}) + ${formatPercent(sheet.overtimePremium)}٪ من أجر الساعة الأساسي. الغياب يُخصم من ${sheet.absenceBase === "GROSS" ? "الإجمالي" : "الأساسي"}.`
      : `Month = ${days} days, ${sheet.hoursPerDay} hours a day. Overtime: hourly ${sheet.overtimeBase === "GROSS" ? "gross" : "basic"} wage + ${formatPercent(sheet.overtimePremium)}% of hourly basic. Absence deducted from ${sheet.absenceBase === "GROSS" ? "gross" : "basic"}.`;

  const css = `@page { size: A4 landscape; margin: 10mm 9mm; }
body { font-size: 8.6pt; }
.page { width: 297mm; min-height: 210mm; margin: 16px auto; padding: 10mm 9mm; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
.meta { display: flex; gap: 24px; margin: 10px 0; font-size: 9pt; flex-wrap: wrap; }
table.sheet { width: 100%; border-collapse: collapse; }
table.sheet thead { display: table-header-group; }
table.sheet th { background: #f1f5f9; font-size: 7.6pt; font-weight: 600; text-align: start; padding: 5px 4px; border-bottom: 1px solid #cbd5e1; vertical-align: bottom; }
table.sheet th.n, table.sheet td.n { text-align: end; white-space: nowrap; }
table.sheet td { padding: 4px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
table.sheet tr { break-inside: avoid; }
.c-no { width: 6mm; color: #64748b; }
.sub { color: #64748b; font-size: 7.6pt; }
.strong { font-weight: 700; }
.sign { width: 22mm; }
tr.group td { background: #f8fafc; font-weight: 600; color: ${brand.colors.accent}; padding-top: 7px; }
tr.subtotal td { font-weight: 600; background: #f8fafc; }
tr.grand td { font-weight: 700; border-top: 2px solid #0f172a; font-size: 9pt; }
.rules { margin-top: 8px; color: #475569; font-size: 8pt; }
.sigs { display: flex; gap: 40px; margin-top: 22px; }
.sigs div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 4px; color: #475569; font-size: 8.5pt; }
@media screen and (max-width: 900px) { .page { width: auto; margin: 0; padding: 12px; overflow-x: auto; } }`;

  const html = `<main class="page">
<header class="head">
  ${companyBlock(company, opts)}
  <div class="title"><h1>${L("salarySheet")}</h1>${status}</div>
</header>
<div class="meta">
  <div class="kv"><span class="k">${L("month")}</span>&nbsp;<span class="v">${esc(period)}</span></div>
  <div class="kv"><span class="k">${L("site")}</span>&nbsp;<span class="v">${esc(sheet.site?.name ?? LABELS.allSites[lang === "en" ? 0 : 1])}</span></div>
  <div class="kv"><span class="k">${L("workers")}</span>&nbsp;<span class="v num">${sheet.workerCount}</span></div>
</div>
<table class="sheet">
<thead><tr>
<th class="c-no">#</th><th>${L("name")}</th><th>${L("iqama")}</th>
<th class="n">${L("basic")}</th><th class="n">${L("allowances")}</th><th class="n">${L("gross")}</th>
<th class="n">${L("absentDays")}</th><th class="n">${L("absence")}</th><th class="n">${L("otHours")}</th><th class="n">${L("overtime")}</th>
<th class="n">${L("additions")}</th><th class="n">${L("deductions")}</th><th class="n">${L("net")}</th><th>${L("signature")}</th>
</tr></thead>
<tbody>
${body}
${sumRow(one("total"), sheet.lines, "grand")}
</tbody>
</table>
<p class="rules">${one("rules")}: ${esc(rulesText)}</p>
${sheet.notes ? `<p class="rules">${one("notes")}: ${esc(sheet.notes)}</p>` : ""}
<div class="sigs"><div>${L("employer")}</div><div>${L("approved")}</div></div>
<footer class="foot"><span>${L("amountsIn")}</span><span>Powered by ${esc(brand.umbrellaName)}</span></footer>
</main>`;
  return shell(opts, `${LABELS.salarySheet[lang === "en" ? 0 : 1]} ${period}`, css, html);
}

// ---------------------------------------------------------------- payslips

export function renderPayslipsHtml(sheet: SalarySheetDetail, lines: SalaryLine[], company: Company, opts: PayrollRenderOptions): string {
  const { lang } = opts;
  const { L, one } = labels(lang);
  const period = monthLabel(sheet.year, sheet.month, lang);
  const row = (key: LabelKey, amount: number, extra = "") => `<tr><th>${L(key)}${extra}</th><td class="num">${money(amount)}</td></tr>`;

  const pages = lines
    .map((l) => {
      const earnings = [
        row("basic", l.basicSalary),
        l.housingAllowance ? row("housing", l.housingAllowance) : "",
        l.transportAllowance ? row("transport", l.transportAllowance) : "",
        l.otherAllowance ? row("other", l.otherAllowance) : "",
        l.overtimePay ? row("overtime", l.overtimePay, ` <span class="hint">(<span class="num">${esc(formatQuantity(l.overtimeHours))}</span> ${one("hours")})</span>`) : "",
        l.additions ? row("additions", l.additions) : "",
      ].join("");
      const totalEarnings = l.grossSalary + l.overtimePay + l.additions;
      const ded = [
        l.absenceDeduction ? row("absence", l.absenceDeduction, ` <span class="hint">(<span class="num">${esc(formatQuantity(l.absentDays))}</span> ${one("days")})</span>`) : "",
        l.advances ? row("advances", l.advances) : "",
        l.deductions ? row("otherDeductions", l.deductions) : "",
      ].join("");
      const totalDed = l.absenceDeduction + l.advances + l.deductions;
      return `<main class="page slip">
<header class="head">
  ${companyBlock(company, opts)}
  <div class="title"><h1>${L("payslip")}</h1><div class="period">${esc(period)}</div>${sheet.status === "APPROVED" ? "" : `<span class="pill draft">${one("draft")}</span>`}</div>
</header>
<section class="who">
  <div>
    <div class="wname">${esc(workerName(l, lang))}</div>
    ${lang === "ar" && l.workerNameAr ? `<div class="muted">${esc(l.workerName)}</div>` : l.workerNameAr ? `<div class="muted" dir="rtl">${esc(l.workerNameAr)}</div>` : ""}
  </div>
  <div class="facts">
    <div class="kv"><span class="k">${L("iqama")}</span><span class="v num">•••• ${esc(l.iqamaLast4)}</span></div>
    ${l.jobTitle ? `<div class="kv"><span class="k">${L("jobTitle")}</span><span class="v">${esc(l.jobTitle)}</span></div>` : ""}
    ${l.siteName ? `<div class="kv"><span class="k">${L("site")}</span><span class="v">${esc(l.siteName)}</span></div>` : ""}
    ${sheet.payDate ? `<div class="kv"><span class="k">${L("payDate")}</span><span class="v num">${dateOnly(sheet.payDate)}</span></div>` : ""}
  </div>
</section>
<section class="cols">
  <table class="amounts"><caption>${L("earnings")}</caption><tbody>${earnings}<tr class="sum"><th>${L("totalEarnings")}</th><td class="num">${money(totalEarnings)}</td></tr></tbody></table>
  <table class="amounts"><caption>${L("deductionsTitle")}</caption><tbody>${ded || `<tr><th>—</th><td class="num">0.00</td></tr>`}<tr class="sum"><th>${L("totalDeductions")}</th><td class="num">${money(totalDed)}</td></tr></tbody></table>
</section>
<section class="net"><span>${L("net")}</span><span class="num">SAR ${money(l.netPay)}</span></section>
${l.notes ? `<p class="muted">${one("notes")}: ${esc(l.notes)}</p>` : ""}
<div class="sigs"><div>${L("employer")}</div><div>${L("received")}</div></div>
<footer class="foot"><span>${L("amountsIn")}</span><span>Powered by ${esc(brand.umbrellaName)}</span></footer>
</main>`;
    })
    .join("\n");

  const css = `@page { size: A4; margin: 14mm 12mm; }
body { font-size: 10pt; }
.page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 14mm 12mm; background: #fff; box-shadow: 0 1px 4px rgba(15,23,42,.12); }
.slip { break-after: page; }
.slip:last-of-type { break-after: auto; }
.period { margin-top: 4px; font-weight: 600; }
.who { display: flex; justify-content: space-between; gap: 20px; margin: 16px 0; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
.wname { font-size: 14pt; font-weight: 600; }
.facts { min-width: 75mm; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
table.amounts { width: 100%; border-collapse: collapse; }
table.amounts caption { text-align: start; font-weight: 600; color: ${brand.colors.accent}; padding-bottom: 6px; font-size: 9.5pt; }
table.amounts caption .l1, table.amounts caption .l2, table.amounts th .l1, table.amounts th .l2 { display: inline; }
table.amounts caption .l2, table.amounts th .l2 { margin-inline-start: 6px; }
table.amounts th { text-align: start; font-weight: 400; padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
table.amounts td { text-align: end; padding: 6px 4px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
table.amounts tr.sum th, table.amounts tr.sum td { font-weight: 700; border-bottom: 0; border-top: 1px solid #94a3b8; }
.hint { color: #64748b; font-size: 8.5pt; }
.net { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding: 12px 14px; border-radius: 6px; background: ${brand.colors.accent}12; border: 1px solid ${brand.colors.accent}55; font-size: 13pt; font-weight: 700; }
.net .l1, .net .l2 { display: inline; }
.net .l2 { margin-inline-start: 8px; }
.sigs { display: flex; gap: 40px; margin-top: 48px; }
.sigs div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 4px; color: #475569; font-size: 9pt; }
.sigs .l1, .sigs .l2 { display: inline; } .sigs .l2 { margin-inline-start: 6px; }
@media screen and (max-width: 820px) { .page { width: auto; min-height: 0; margin: 0 0 8px; padding: 16px; } .cols { grid-template-columns: 1fr; } .who { flex-direction: column; } }`;
  const title = lines.length === 1 ? `${LABELS.payslip[lang === "en" ? 0 : 1]} ${lines[0]!.workerName} ${period}` : `${LABELS.payslip[lang === "en" ? 0 : 1]} ${period}`;
  return shell(opts, title, css, pages);
}
