/**
 * The monthly timesheet: one row per worker. The app fills in who the workers are;
 * the company fills in absences, overtime and the money columns. Headers are matched
 * in English or Arabic, in any order, so a file downloaded in one language can be
 * uploaded in the other.
 */
export interface TimesheetColumn {
  key: string;
  en: string;
  ar: string;
  width: number;
  /** "input" columns are filled in by the company; "info" columns are for reading only. */
  kind: "input" | "info" | "ref";
}

export const TIMESHEET_COLUMNS: readonly TimesheetColumn[] = [
  { key: "name", en: "Name", ar: "الاسم", width: 26, kind: "info" },
  { key: "iqamaLast4", en: "Iqama (last 4)", ar: "الإقامة (آخر 4 أرقام)", width: 12, kind: "info" },
  { key: "siteName", en: "Site", ar: "الموقع", width: 20, kind: "info" },
  { key: "monthlySalary", en: "Monthly salary (SAR)", ar: "الراتب الشهري (ريال)", width: 14, kind: "info" },
  { key: "absentDays", en: "Unpaid absent days", ar: "أيام الغياب بدون أجر", width: 14, kind: "input" },
  { key: "overtimeHours", en: "Overtime hours", ar: "ساعات العمل الإضافي", width: 14, kind: "input" },
  { key: "additions", en: "Bonus / additions (SAR)", ar: "مكافآت وإضافات (ريال)", width: 16, kind: "input" },
  { key: "advances", en: "Advance to deduct (SAR)", ar: "سلفة تُخصم (ريال)", width: 16, kind: "input" },
  { key: "deductions", en: "Other deductions (SAR)", ar: "خصومات أخرى (ريال)", width: 16, kind: "input" },
  { key: "notes", en: "Notes", ar: "ملاحظات", width: 28, kind: "input" },
  { key: "workerRef", en: "Worker ref (do not change)", ar: "رقم العامل (لا تغيّره)", width: 28, kind: "ref" },
];
