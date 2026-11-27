import ExcelJS from "exceljs";
import { formatQuantity } from "@/features/sales/totals";
import { monthLabel } from "./documents";
import type { SalarySheetDetail } from "./service";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };

const COLS = [
  { key: "no", en: "#", ar: "#", width: 5 },
  { key: "name", en: "Name", ar: "الاسم", width: 26 },
  { key: "iqama", en: "Iqama (last 4)", ar: "الإقامة (آخر 4)", width: 12 },
  { key: "jobTitle", en: "Job title", ar: "المهنة", width: 16 },
  { key: "site", en: "Site", ar: "الموقع", width: 20 },
  { key: "basic", en: "Basic", ar: "الأساسي", width: 12, money: true },
  { key: "housing", en: "Housing", ar: "السكن", width: 11, money: true },
  { key: "transport", en: "Transport", ar: "النقل", width: 11, money: true },
  { key: "other", en: "Other allowance", ar: "بدلات أخرى", width: 11, money: true },
  { key: "gross", en: "Gross", ar: "الإجمالي", width: 12, money: true },
  { key: "absentDays", en: "Absent days", ar: "أيام الغياب", width: 10, qty: true },
  { key: "absence", en: "Absence deduction", ar: "خصم الغياب", width: 12, money: true },
  { key: "otHours", en: "OT hours", ar: "ساعات إضافية", width: 10, qty: true },
  { key: "overtime", en: "Overtime pay", ar: "أجر الإضافي", width: 12, money: true },
  { key: "additions", en: "Additions", ar: "إضافات", width: 11, money: true },
  { key: "advances", en: "Advances", ar: "السلف", width: 11, money: true },
  { key: "deductions", en: "Other deductions", ar: "خصومات أخرى", width: 11, money: true },
  { key: "net", en: "Net pay", ar: "صافي الراتب", width: 13, money: true },
  { key: "notes", en: "Notes", ar: "ملاحظات", width: 26 },
] as const;

const sar = (h: number) => h / 100; // display only; source values stay integer halalas
const qty = (q: number) => Number(formatQuantity(q));

/** The salary sheet as .xlsx: one row per worker and a total row. Amounts in SAR as numbers. */
export async function buildSalarySheetWorkbook(sheet: SalarySheetDetail, opts: { locale: "en" | "ar"; companyName: string }) {
  const ar = opts.locale === "ar";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NeaLabs";
  const ws = workbook.addWorksheet(ar ? "مسير الرواتب" : "Salary sheet", { views: [{ state: "frozen", ySplit: 3, rightToLeft: ar }] });
  ws.addRow([`${opts.companyName} – ${ar ? "مسير الرواتب" : "Salary sheet"} ${monthLabel(sheet.year, sheet.month, opts.locale)}${sheet.site ? ` – ${sheet.site.name}` : ""}`]).font = { bold: true, size: 13 };
  ws.addRow([sheet.status === "APPROVED" ? (ar ? "معتمد" : "Approved") : ar ? "مسودة – غير معتمد" : "Draft – not approved"]);
  const header = ws.addRow(COLS.map((c) => (ar ? c.ar : c.en)));
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  header.alignment = { wrapText: true, vertical: "middle" };
  COLS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width;
    if ("money" in c) col.numFmt = "#,##0.00";
  });

  sheet.lines.forEach((l, i) => {
    ws.addRow([
      i + 1,
      ar && l.workerNameAr ? l.workerNameAr : l.workerName,
      l.iqamaLast4,
      l.jobTitle ?? "",
      l.siteName ?? "",
      sar(l.basicSalary),
      sar(l.housingAllowance),
      sar(l.transportAllowance),
      sar(l.otherAllowance),
      sar(l.grossSalary),
      qty(l.absentDays),
      sar(l.absenceDeduction),
      qty(l.overtimeHours),
      sar(l.overtimePay),
      sar(l.additions),
      sar(l.advances),
      sar(l.deductions),
      sar(l.netPay),
      l.notes ?? "",
    ]);
  });
  const sum = (f: (l: SalarySheetDetail["lines"][number]) => number) => sar(sheet.lines.reduce((a, l) => a + f(l), 0));
  const total = ws.addRow([
    "",
    ar ? "الإجمالي" : "Total",
    "",
    "",
    "",
    sum((l) => l.basicSalary),
    sum((l) => l.housingAllowance),
    sum((l) => l.transportAllowance),
    sum((l) => l.otherAllowance),
    sum((l) => l.grossSalary),
    "",
    sum((l) => l.absenceDeduction),
    "",
    sum((l) => l.overtimePay),
    sum((l) => l.additions),
    sum((l) => l.advances),
    sum((l) => l.deductions),
    sum((l) => l.netPay),
    "",
  ]);
  total.font = { bold: true };
  total.fill = TOTAL_FILL;
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
