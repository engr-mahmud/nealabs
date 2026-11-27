/**
 * Salary calculation. Pure functions on integers only: money in halalas, days and hours
 * in thousandths (1.5 = 1500). Each amount is rounded once, half up. The same code runs
 * for the preview and on save, and the database checks that the parts add up.
 */

export type PayBase = "BASIC" | "GROSS";

export interface PayrollRules {
  overtimeBase: PayBase;
  /** Basis points of the hourly basic wage added per overtime hour (5000 = 50%). */
  overtimePremium: number;
  hoursPerDay: number;
  /** Days that turn a monthly amount into a daily one. 0 = calendar days of the month. */
  monthDays: number;
}

export interface PayrollRulesFull extends PayrollRules {
  absenceBase: PayBase;
}

export interface SalaryInput {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  /** Thousandths of a day. */
  absentDays: number;
  /** Thousandths of an hour. */
  overtimeHours: number;
  additions: number;
  advances: number;
  deductions: number;
}

export interface SalaryResult {
  grossSalary: number;
  absenceDeduction: number;
  overtimePay: number;
  netPay: number;
}

/** round(product of nums / product of dens), half up, exact with BigInt. Non-negative inputs. */
export function roundRatio(nums: number[], dens: number[]): number {
  const n = nums.reduce((acc, x) => acc * BigInt(x), 1n);
  const d = dens.reduce((acc, x) => acc * BigInt(x), 1n);
  if (d === 0n) throw new Error("Division by zero");
  return Number((n * 2n + d) / (d * 2n));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The day count used for daily and hourly rates in this month. */
export function effectiveMonthDays(rules: Pick<PayrollRules, "monthDays">, year: number, month: number): number {
  return rules.monthDays > 0 ? rules.monthDays : daysInMonth(year, month);
}

/**
 * gross   = basic + housing + transport + other
 * absence = (absence base) × absent days ÷ month days            (never more than the base)
 * overtime = hours × [ (overtime base) + premium × basic ] ÷ (month days × hours per day)
 * net     = gross − absence + overtime + additions − advances − deductions
 * Net can come out negative; callers must reject that (the database refuses it too).
 */
export function computeSalary(rules: PayrollRulesFull, input: SalaryInput, year: number, month: number): SalaryResult {
  const days = effectiveMonthDays(rules, year, month);
  const basic = input.basicSalary;
  const grossSalary = basic + input.housingAllowance + input.transportAllowance + input.otherAllowance;

  const absenceBase = rules.absenceBase === "BASIC" ? basic : grossSalary;
  const absenceDeduction = Math.min(absenceBase, roundRatio([absenceBase, input.absentDays], [days, 1000]));

  // Per overtime hour: the hourly wage of the overtime base plus a premium on the hourly basic wage.
  // Written over one common denominator so it is rounded only once.
  const otBase = rules.overtimeBase === "BASIC" ? basic : grossSalary;
  const perHourNumerator = otBase * 10_000 + basic * rules.overtimePremium; // ÷ 10_000 ÷ (days × hours)
  const overtimePay = roundRatio([perHourNumerator, input.overtimeHours], [10_000, days, rules.hoursPerDay, 1000]);

  const netPay = grossSalary - absenceDeduction + overtimePay + input.additions - input.advances - input.deductions;
  return { grossSalary, absenceDeduction, overtimePay, netPay };
}

export interface SheetTotals {
  workerCount: number;
  totalGross: number;
  totalOvertime: number;
  totalAdditions: number;
  /** Absence + advances + other deductions. */
  totalDeductions: number;
  totalNet: number;
}

export function sumLines(lines: (SalaryResult & Pick<SalaryInput, "additions" | "advances" | "deductions">)[]): SheetTotals {
  const t: SheetTotals = { workerCount: lines.length, totalGross: 0, totalOvertime: 0, totalAdditions: 0, totalDeductions: 0, totalNet: 0 };
  for (const l of lines) {
    t.totalGross += l.grossSalary;
    t.totalOvertime += l.overtimePay;
    t.totalAdditions += l.additions;
    t.totalDeductions += l.absenceDeduction + l.advances + l.deductions;
    t.totalNet += l.netPay;
  }
  return t;
}

/** "2026-11" → { year, month }, or null. */
export function parsePeriod(raw: string | null | undefined): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2200) return null;
  return { year, month };
}

export function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Last day of the month as a UTC-midnight date. */
export function monthEnd(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}
