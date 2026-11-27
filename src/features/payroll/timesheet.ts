import ExcelJS from "exceljs";
import { halalasToInput } from "@/lib/parse";
import { formatQuantity } from "@/features/sales/totals";
import { payrollConfig } from "@/config/payroll";
import { readColumns, type SheetRow } from "@/features/import/excel";
import { TIMESHEET_COLUMNS } from "./timesheet-columns";

/** A sheet must say which worker each row is for: by reference (from the template) or by name. */
export async function readTimesheet(bytes: Uint8Array): Promise<SheetRow[]> {
  return readColumns(
    TIMESHEET_COLUMNS.map((c) => ({ ...c, required: c.key === "name" })),
    bytes,
    payrollConfig,
  );
}

export interface TimesheetWorker {
  id: string;
  name: string;
  iqamaLast4: string;
  siteName: string | null;
  monthlySalary: number;
  /** Values already on a draft sheet (when the file is downloaded again). */
  existing?: { absentDays: number; overtimeHours: number; additions: number; advances: number; deductions: number; notes: string | null };
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
const INFO_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
const INPUT_HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };

export async function buildTimesheetTemplate(workers: TimesheetWorker[], opts: { locale: "en" | "ar"; periodLabel: string; companyName: string }) {
  const ar = opts.locale === "ar";
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NeaLabs";
  const sheet = workbook.addWorksheet(ar ? "سجل الدوام" : "Timesheet", { views: [{ state: "frozen", ySplit: 1, xSplit: 1, rightToLeft: ar }] });
  sheet.columns = TIMESHEET_COLUMNS.map((c) => ({ header: ar ? c.ar : c.en, key: c.key, width: c.width, style: { numFmt: "@" } }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };
  header.height = 32;
  TIMESHEET_COLUMNS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.fill = c.kind === "input" ? INPUT_HEADER_FILL : HEADER_FILL;
    if (c.kind === "ref") cell.note = ar ? "يربط الصف بالعامل. لا تغيّره ولا تحذفه." : "Links the row to the worker. Do not change or delete it.";
  });

  for (const w of workers) {
    const e = w.existing;
    const row = sheet.addRow({
      name: w.name,
      iqamaLast4: w.iqamaLast4,
      siteName: w.siteName ?? "",
      monthlySalary: halalasToInput(w.monthlySalary),
      absentDays: e && e.absentDays ? formatQuantity(e.absentDays) : "",
      overtimeHours: e && e.overtimeHours ? formatQuantity(e.overtimeHours) : "",
      additions: e && e.additions ? halalasToInput(e.additions) : "",
      advances: e && e.advances ? halalasToInput(e.advances) : "",
      deductions: e && e.deductions ? halalasToInput(e.deductions) : "",
      notes: e?.notes ?? "",
      workerRef: w.id,
    });
    TIMESHEET_COLUMNS.forEach((c, i) => {
      if (c.kind !== "input") {
        const cell = row.getCell(i + 1);
        cell.fill = INFO_FILL;
        cell.font = { color: { argb: "FF64748B" } };
      }
    });
  }

  const help = workbook.addWorksheet(ar ? "تعليمات" : "Instructions", { views: [{ rightToLeft: ar }] });
  help.getColumn(1).width = 100;
  const lines = ar
    ? [
        `${opts.companyName} – سجل الدوام لشهر ${opts.periodLabel}`,
        "",
        "املأ الأعمدة الزرقاء فقط: أيام الغياب بدون أجر، ساعات العمل الإضافي، المكافآت، السلف، الخصومات، الملاحظات.",
        "اترك الخانة فارغة إذا لم يكن هناك شيء (فارغ = صفر). يمكن استخدام الكسور مثل 0.5 يوم أو 7.5 ساعة.",
        "المبالغ بالريال مثل 150 أو 150.50. الراتب الشهري للعرض فقط ويُؤخذ من بيانات العامل.",
        "لا تغيّر عمود «رقم العامل». لإضافة عامل جديد أضفه أولاً في صفحة العمال ثم نزّل الملف من جديد.",
        "سترى معاينة قبل الحفظ، والصفوف التي فيها أخطاء تظهر باللون الأحمر.",
      ]
    : [
        `${opts.companyName} – timesheet for ${opts.periodLabel}`,
        "",
        "Fill in the blue columns only: unpaid absent days, overtime hours, bonus, advances, deductions, notes.",
        "Leave a cell empty when there is nothing (empty = 0). Fractions are fine, for example 0.5 day or 7.5 hours.",
        "Amounts in SAR, for example 150 or 150.50. The monthly salary is for reference only; it comes from the worker's record.",
        "Do not change the 'Worker ref' column. To add a new worker, add them under Workforce first, then download this file again.",
        "You will see a preview before anything is saved; rows with errors are shown in red.",
      ];
  lines.forEach((l, i) => {
    const r = help.addRow([l]);
    if (i === 0) r.font = { bold: true, size: 13 };
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
