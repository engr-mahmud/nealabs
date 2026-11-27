/** Settings for income and expenses. Change here, not in components. */

export interface DefaultCategory {
  key: string;
  nameEn: string;
  nameAr: string;
}

export const financeConfig = {
  /** VAT rate used to split "amount includes VAT" on manual entries (basis points, 1500 = 15%). */
  vatRate: 1500,
  pageSize: 50,
  /**
   * Default categories every company starts with (stored per company, so names can be
   * edited). Keys used by the app itself are in `systemKeys`.
   */
  defaultCategories: {
    INCOME: [
      { key: "invoice_payments", nameEn: "Invoice payments", nameAr: "دفعات الفواتير" },
      { key: "other_income", nameEn: "Other income", nameAr: "إيرادات أخرى" },
    ],
    EXPENSE: [
      { key: "salaries", nameEn: "Salaries", nameAr: "الرواتب" },
      { key: "accommodation", nameEn: "Accommodation", nameAr: "السكن" },
      { key: "transport", nameEn: "Transport & fuel", nameAr: "النقل والوقود" },
      { key: "food", nameEn: "Food", nameAr: "الطعام" },
      { key: "government_fees", nameEn: "Iqama, visa & government fees", nameAr: "رسوم الإقامة والتأشيرات والرسوم الحكومية" },
      { key: "medical", nameEn: "Medical & insurance", nameAr: "التأمين الطبي والعلاج" },
      { key: "rent", nameEn: "Office rent", nameAr: "إيجار المكتب" },
      { key: "utilities", nameEn: "Utilities & phone", nameAr: "المرافق والاتصالات" },
      { key: "tools", nameEn: "Tools & equipment", nameAr: "الأدوات والمعدات" },
      { key: "other_expense", nameEn: "Other expenses", nameAr: "مصروفات أخرى" },
    ],
  } satisfies Record<"INCOME" | "EXPENSE", DefaultCategory[]>,
  /** Categories the app posts to automatically. They cannot be archived. */
  systemKeys: { invoicePayments: "invoice_payments", salaries: "salaries" },
} as const;
