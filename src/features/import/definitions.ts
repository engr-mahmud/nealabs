/**
 * Excel columns for each master-data type. The same columns are used for the
 * template, the import and the export, so an exported file can be edited and
 * imported again. Headers are matched in English or Arabic, ignoring case.
 */
export type ImportType = "clients" | "sites" | "workers";

export const IMPORT_TYPES: readonly ImportType[] = ["clients", "sites", "workers"];

export function isImportType(value: unknown): value is ImportType {
  return typeof value === "string" && (IMPORT_TYPES as readonly string[]).includes(value);
}

export interface ColumnDef {
  key: string;
  en: string;
  ar: string;
  required?: boolean;
  example: string;
  width: number;
  /** Shown masked in the import preview. */
  sensitive?: boolean;
}

export const COLUMNS: Record<ImportType, ColumnDef[]> = {
  clients: [
    { key: "nameEn", en: "Client name (English)", ar: "اسم العميل (إنجليزي)", required: true, example: "Gulf Construction Co", width: 30 },
    { key: "nameAr", en: "Client name (Arabic)", ar: "اسم العميل (عربي)", example: "شركة الخليج للإنشاءات", width: 30 },
    { key: "vatNumber", en: "VAT number", ar: "الرقم الضريبي", example: "300000000000003", width: 20 },
    { key: "crNumber", en: "CR number", ar: "السجل التجاري", example: "2050000000", width: 16 },
    { key: "contactName", en: "Contact person", ar: "الشخص المسؤول", example: "Ahmed Ali", width: 22 },
    { key: "phone", en: "Phone", ar: "الهاتف", example: "0138000000", width: 16 },
    { key: "email", en: "Email", ar: "البريد الإلكتروني", example: "accounts@gulfco.example", width: 28 },
    { key: "addressLine", en: "Address", ar: "العنوان", example: "Prince Mohammed St", width: 30 },
    { key: "city", en: "City", ar: "المدينة", example: "Dammam", width: 16 },
    { key: "postalCode", en: "Postal code", ar: "الرمز البريدي", example: "32241", width: 12 },
    { key: "notes", en: "Notes", ar: "ملاحظات", example: "", width: 30 },
  ],
  sites: [
    { key: "clientName", en: "Client name", ar: "اسم العميل", required: true, example: "Gulf Construction Co", width: 30 },
    { key: "name", en: "Site name", ar: "اسم الموقع", required: true, example: "Jubail Plant", width: 28 },
    { key: "city", en: "City", ar: "المدينة", example: "Jubail", width: 16 },
    { key: "address", en: "Address", ar: "العنوان", example: "Industrial Area 2", width: 30 },
    { key: "notes", en: "Notes", ar: "ملاحظات", example: "", width: 30 },
  ],
  workers: [
    { key: "name", en: "Name", ar: "الاسم", required: true, example: "Mohammad Rahim", width: 26 },
    { key: "nameAr", en: "Name (Arabic)", ar: "الاسم (عربي)", example: "", width: 22 },
    { key: "iqamaNumber", en: "Iqama number", ar: "رقم الإقامة", required: true, example: "2123456789", width: 16, sensitive: true },
    { key: "nationality", en: "Nationality", ar: "الجنسية", example: "Bangladesh", width: 16 },
    { key: "jobTitle", en: "Job title", ar: "المهنة", example: "Electrician", width: 18 },
    { key: "phone", en: "Mobile", ar: "الجوال", example: "0512345678", width: 15 },
    { key: "basicSalary", en: "Basic salary (SAR)", ar: "الراتب الأساسي (ريال)", example: "1500", width: 14 },
    { key: "housingAllowance", en: "Housing allowance (SAR)", ar: "بدل السكن (ريال)", example: "300", width: 14 },
    { key: "transportAllowance", en: "Transport allowance (SAR)", ar: "بدل النقل (ريال)", example: "150", width: 14 },
    { key: "otherAllowance", en: "Other allowance (SAR)", ar: "بدلات أخرى (ريال)", example: "0", width: 14 },
    { key: "clientName", en: "Client", ar: "العميل", example: "Gulf Construction Co", width: 26 },
    { key: "siteName", en: "Site", ar: "الموقع", example: "Jubail Plant", width: 22 },
    { key: "iqamaExpiry", en: "Iqama expiry (YYYY-MM-DD)", ar: "انتهاء الإقامة", example: "2027-03-15", width: 16 },
    { key: "passportNumber", en: "Passport number", ar: "رقم الجواز", example: "A01234567", width: 16, sensitive: true },
    { key: "passportExpiry", en: "Passport expiry (YYYY-MM-DD)", ar: "انتهاء الجواز", example: "2029-08-01", width: 16 },
  ],
};

export function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
