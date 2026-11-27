/** Payroll settings. Change here, not in components. */

export const payrollConfig = {
  /**
   * Starting rules for a new company. Every company can change them under Salaries > Rules.
   * They are NOT legal advice: overtime and absence rules must be checked against the
   * Saudi Labor Law (overtime: Article 107) and each worker's contract. See DECISIONS.md.
   */
  defaults: {
    overtimeBase: "GROSS" as const,
    /** Basis points of the hourly BASIC wage added per overtime hour (5000 = 50%). */
    overtimePremium: 5000,
    hoursPerDay: 8,
    /** 0 = use the calendar days of the month. */
    monthDays: 30,
    absenceBase: "GROSS" as const,
  },
  /** Sanity limits for one worker in one month. */
  maxOvertimeHours: 300,
  /** Excel upload limits (same as the master data import). */
  maxBytes: 2 * 1024 * 1024,
  maxRows: 2000,
  pageSize: 50,
  /** Earliest month a sheet can be made for. */
  minYear: 2020,
} as const;
