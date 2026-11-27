import ExcelJS from "exceljs";
import { masterDataConfig } from "@/config/master-data";
import { AppError } from "@/lib/errors";
import { COLUMNS, normalizeHeader, type ImportType } from "./definitions";

export interface SheetRow {
  /** Row number as shown in Excel (header is row 1). */
  rowNumber: number;
  values: Record<string, string>;
}

const XLSX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // .xlsx is a zip file

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  if (typeof value === "string") return value.trim();
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if ("richText" in value) return value.richText.map((r) => r.text).join("").trim();
  if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
  if ("text" in value) return String(value.text).trim();
  return "";
}

/**
 * Reads the first worksheet of an .xlsx file into rows keyed by column key.
 * Columns are found by their header (English, Arabic or key), so their order does not matter.
 */
export async function readSheet(type: ImportType, bytes: Uint8Array): Promise<SheetRow[]> {
  if (bytes.length === 0) throw new AppError("importNoFile");
  if (bytes.length > masterDataConfig.import.maxBytes) throw new AppError("importTooLarge");
  if (!XLSX_MAGIC.every((b, i) => bytes[i] === b)) throw new AppError("importNotExcel");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new AppError("importNotExcel");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("importEmpty");

  const lookup = new Map<string, string>();
  for (const col of COLUMNS[type]) {
    for (const label of [col.en, col.ar, col.key]) lookup.set(normalizeHeader(label), col.key);
  }
  const columnKeys = new Map<number, string>();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const key = lookup.get(normalizeHeader(cellText(cell.value)));
    if (key) columnKeys.set(colNumber, key);
  });
  const found = new Set(columnKeys.values());
  const missing = COLUMNS[type].filter((c) => c.required && !found.has(c.key));
  if (missing.length > 0) throw new AppError("importMissingColumns");

  const rows: SheetRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, string> = {};
    for (const [colNumber, key] of columnKeys) values[key] = cellText(row.getCell(colNumber).value);
    if (Object.values(values).every((v) => v === "")) return; // skip blank lines
    rows.push({ rowNumber, values });
  });
  if (rows.length === 0) throw new AppError("importEmpty");
  if (rows.length > masterDataConfig.import.maxRows) throw new AppError("importTooManyRows");
  return rows;
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

/** Builds an .xlsx with the standard columns: an empty template (example on the Instructions sheet) or an export. */
export async function buildWorkbook(type: ImportType, rows: Record<string, string>[] | "template", locale: "en" | "ar") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NeaLabs";
  const sheet = workbook.addWorksheet(type, { views: [{ state: "frozen", ySplit: 1, rightToLeft: locale === "ar" }] });
  sheet.columns = COLUMNS[type].map((c) => ({
    header: locale === "ar" ? c.ar : c.en,
    key: c.key,
    width: c.width,
    // Text format so Excel keeps leading zeros (phones) and long numbers (Iqama, VAT).
    style: { numFmt: "@" },
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = HEADER_FILL;
  COLUMNS[type].forEach((c, i) => {
    if (c.required) header.getCell(i + 1).note = locale === "ar" ? "مطلوب" : "Required";
  });

  if (rows === "template") {
    const help = workbook.addWorksheet(locale === "ar" ? "تعليمات" : "Instructions", { views: [{ rightToLeft: locale === "ar" }] });
    COLUMNS[type].forEach((c, i) => (help.getColumn(i + 1).width = i === 0 ? Math.max(c.width, 60) : c.width));
    const lines =
      locale === "ar"
        ? [
            "املأ ورقة البيانات الأولى، صفاً لكل سجل.",
            "الأعمدة المطلوبة عليها ملاحظة «مطلوب». لا تغيّر عناوين الأعمدة.",
            "التواريخ بالشكل 2027-03-15 أو 15/03/2027. المبالغ بالريال مثل 1500 أو 1500.50.",
            "سترى معاينة قبل الحفظ، والصفوف التي فيها أخطاء تظهر باللون الأحمر.",
          ]
        : [
            "Fill in the first sheet, one row per record.",
            "Required columns have a 'Required' note. Do not change the column headers.",
            "Dates as 2027-03-15 or 15/03/2027. Amounts in SAR, for example 1500 or 1500.50.",
            "You will see a preview before anything is saved; rows with errors are shown in red.",
          ];
    lines.forEach((l) => help.addRow([l]));
    help.addRow([]);
    help.addRow([locale === "ar" ? "مثال:" : "Example:"]).font = { bold: true };
    help.addRow(COLUMNS[type].map((c) => (locale === "ar" ? c.ar : c.en))).fill = HEADER_FILL;
    help.addRow(COLUMNS[type].map((c) => c.example));
  } else {
    for (const r of rows) sheet.addRow(r);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
