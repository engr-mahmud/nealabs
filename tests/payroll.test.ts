import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantDb } from "@/lib/db";
import { FieldError, ForbiddenError, NotFoundError, ReadOnlyError } from "@/lib/errors";
import type { OrgContext } from "@/features/organizations/context";
import { createSite } from "@/features/sites/service";
import { createWorker, updateWorker } from "@/features/workforce/service";
import { listEntries } from "@/features/finance/service";
import { siteProfitReport } from "@/features/finance/report";
import { computeSalary, daysInMonth, parsePeriod, sumLines, type PayrollRulesFull } from "@/features/payroll/calc";
import { parseThousandths } from "@/features/payroll/schemas";
import { buildTimesheetTemplate, readTimesheet } from "@/features/payroll/timesheet";
import { buildSalarySheetWorkbook } from "@/features/payroll/export";
import { renderPayslipsHtml, renderSalarySheetHtml } from "@/features/payroll/documents";
import {
  addMissingWorkers,
  approveSheet,
  createSheetForActiveWorkers,
  deleteDraftSheet,
  getPayrollSettings,
  getSheet,
  importTimesheet,
  markPaid,
  markUnpaid,
  paymentState,
  unpaidSalaries,
  listSheets,
  previewTimesheet,
  refreshDraft,
  removeLine,
  reopenSheet,
  savePayrollSettings,
  timesheetWorkers,
  updateLine,
} from "@/features/payroll/service";
import { addMember, createOwnerWithOrg, orgWithSite, resetDb, workerInput } from "./helpers";

const DAY = 86_400_000;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const DEFAULT: PayrollRulesFull = { overtimeBase: "GROSS", overtimePremium: 5000, hoursPerDay: 8, monthDays: 30, absenceBase: "GROSS" };
const ZERO = { absentDays: 0, overtimeHours: 0, additions: 0, advances: 0, deductions: 0 };
const pay = { basicSalary: 150000, housingAllowance: 30000, transportAllowance: 20000, otherAllowance: 0 }; // 2,000 SAR gross
const NOV = { year: 2026, month: 11 };
const noInput = { absentDays: 0, overtimeHours: 0, additions: 0, advances: 0, deductions: 0, notes: null };

describe("payroll: calculation", () => {
  it("a full month with nothing entered pays the gross salary", () => {
    const r = computeSalary(DEFAULT, { ...pay, ...ZERO }, 2026, 11);
    expect(r).toEqual({ grossSalary: 200000, absenceDeduction: 0, overtimePay: 0, netPay: 200000 });
  });

  it("deducts unpaid absent days from the chosen base, never more than the base", () => {
    expect(computeSalary(DEFAULT, { ...pay, ...ZERO, absentDays: 3000 }, 2026, 11).absenceDeduction).toBe(20000); // 2000 / 30 × 3
    expect(computeSalary({ ...DEFAULT, absenceBase: "BASIC" }, { ...pay, ...ZERO, absentDays: 1500 }, 2026, 11).absenceDeduction).toBe(7500); // 1500 / 30 × 1.5
    expect(computeSalary(DEFAULT, { ...pay, ...ZERO, absentDays: 31000 }, 2026, 12).absenceDeduction).toBe(200000); // capped
  });

  it("overtime: hourly wage of the base + premium on hourly basic, rounded once", () => {
    // Default: hourly gross 2000/240 = 8.3333 + 50% of hourly basic 1500/240 = 3.125 → 11.4583 per hour
    expect(computeSalary(DEFAULT, { ...pay, ...ZERO, overtimeHours: 10000 }, 2026, 11).overtimePay).toBe(11458);
    // Basic + 50% = 1.5 × hourly basic: 6.25 × 1.5 × 10 = 93.75
    expect(computeSalary({ ...DEFAULT, overtimeBase: "BASIC" }, { ...pay, ...ZERO, overtimeHours: 10000 }, 2026, 11).overtimePay).toBe(9375);
    // Half hours work: 7.5 h
    expect(computeSalary({ ...DEFAULT, overtimeBase: "BASIC" }, { ...pay, ...ZERO, overtimeHours: 7500 }, 2026, 11).overtimePay).toBe(7031); // 70.3125
  });

  it("calendar-day months use the real number of days", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    const r = computeSalary({ ...DEFAULT, monthDays: 0 }, { ...pay, ...ZERO, absentDays: 1000 }, 2026, 2);
    expect(r.absenceDeduction).toBe(7143); // 2000 / 28
  });

  it("net = gross − absence + overtime + additions − advances − deductions (and can go negative)", () => {
    const r = computeSalary(DEFAULT, { ...pay, absentDays: 1000, overtimeHours: 0, additions: 10000, advances: 50000, deductions: 2500 }, 2026, 11);
    expect(r.netPay).toBe(200000 - 6667 + 10000 - 50000 - 2500);
    expect(computeSalary(DEFAULT, { ...pay, ...ZERO, advances: 300000 }, 2026, 11).netPay).toBeLessThan(0);
  });

  it("sums sheet totals and parses inputs", () => {
    const a = { ...computeSalary(DEFAULT, { ...pay, ...ZERO, overtimeHours: 2000, advances: 1000 }, 2026, 11), additions: 0, advances: 1000, deductions: 0 };
    const b = { ...computeSalary(DEFAULT, { ...pay, ...ZERO, absentDays: 1000, additions: 500 }, 2026, 11), additions: 500, advances: 0, deductions: 0 };
    const t = sumLines([a, b]);
    expect(t.totalNet).toBe(t.totalGross + t.totalOvertime + t.totalAdditions - t.totalDeductions);
    expect(parseThousandths("")).toBe(0);
    expect(parseThousandths("7.5")).toBe(7500);
    expect(parseThousandths("٢")).toBe(2000);
    expect(parseThousandths("-1")).toBeNull();
    expect(parseThousandths("abc")).toBeNull();
    expect(parsePeriod("2026-11")).toEqual(NOV);
    expect(parsePeriod("2026-13")).toBeNull();
  });
});

async function setup(name = "Payroll Co") {
  const base = await orgWithSite(name);
  const site2 = await createSite(base.ctx, { clientId: base.client.id, name: "North Camp", city: null, address: null, notes: null });
  const w1 = await createWorker(base.ctx, workerInput("Rahim Uddin", "2100000001", { siteId: base.site.id, ...pay }));
  const w2 = await createWorker(base.ctx, workerInput("Karim Mia", "2100000002", { siteId: site2.id, ...pay, transportAllowance: 0 }));
  const w3 = await createWorker(base.ctx, workerInput("Office Boy", "2100000003", { basicSalary: 100000, housingAllowance: 0 }));
  return { ...base, site2, w1, w2, w3 };
}

/** Downloads the template for a month, fills cells per worker name, and returns the parsed rows. */
async function filledTimesheet(ctx: OrgContext, fill: Record<string, Record<string, string>>, extraRows: Record<string, string>[] = []) {
  const workers = await timesheetWorkers(ctx, NOV.year, NOV.month, null, null);
  const bytes = await buildTimesheetTemplate(workers, { locale: "en", periodLabel: "November 2026", companyName: "Co" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  const headers = new Map<string, number>();
  ws.getRow(1).eachCell((c, col) => headers.set(String(c.value), col));
  const col = (en: string) => headers.get(en)!;
  const keys: Record<string, string> = { absentDays: "Unpaid absent days", overtimeHours: "Overtime hours", additions: "Bonus / additions (SAR)", advances: "Advance to deduct (SAR)", deductions: "Other deductions (SAR)", notes: "Notes", name: "Name", workerRef: "Worker ref (do not change)" };
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values = fill[String(row.getCell(col("Name")).value)];
    if (values) for (const [k, v] of Object.entries(values)) row.getCell(col(keys[k]!)).value = v;
  });
  for (const extra of extraRows) {
    const row = ws.addRow([]);
    for (const [k, v] of Object.entries(extra)) row.getCell(col(keys[k]!)).value = v;
  }
  return readTimesheet(new Uint8Array(await wb.xlsx.writeBuffer()));
}

describe("payroll: timesheet to salary sheet", () => {
  beforeEach(resetDb);

  it("template lists active workers; upload is checked row by row; valid rows become a draft", async () => {
    const { ctx, w1, w3 } = await setup();
    const rows = await filledTimesheet(
      ctx,
      { "Rahim Uddin": { absentDays: "2", overtimeHours: "10", advances: "300" }, "Karim Mia": { overtimeHours: "abc" }, "Office Boy": { additions: "50", notes: "Eid bonus" } },
      [{ name: "Unknown Person", absentDays: "1" }],
    );
    expect(rows).toHaveLength(4);

    const preview = await previewTimesheet(ctx, { ...NOV, siteId: null, sheetId: null }, rows);
    expect(preview.validCount).toBe(2);
    expect(preview.errorCount).toBe(2);
    const karim = preview.rows.find((r) => r.values.name === "Karim Mia")!;
    expect(karim.errors.overtimeHours).toBe("invalidHours");
    const unknown = preview.rows.find((r) => r.values.name === "Unknown Person")!;
    expect(unknown.errors.name).toBe("timesheetWorkerUnknown");
    const rahim = preview.rows.find((r) => r.workerId === w1.id)!;
    expect(rahim.netPay).toBe(200000 - 13333 + 11458 - 30000);

    const result = await importTimesheet(ctx, { ...NOV, siteId: null, sheetId: null }, rows);
    expect(result).toMatchObject({ imported: 2, skipped: 2 });
    const sheet = await getSheet(ctx, result.sheetId);
    expect(sheet.status).toBe("DRAFT");
    expect(sheet.workerCount).toBe(2);
    expect(sheet.totalNet).toBe(sheet.lines.reduce((s, l) => s + l.netPay, 0));
    const office = sheet.lines.find((l) => l.workerId === w3.id)!;
    expect(office).toMatchObject({ siteId: null, additions: 5000, notes: "Eid bonus", netPay: 105000 });
    expect(office.iqamaLast4).toBe("0003");

    // The same workers cannot be on a second sheet of the same month...
    const again = await previewTimesheet(ctx, { ...NOV, siteId: null, sheetId: null }, rows);
    expect(again.rows.find((r) => r.workerId === w1.id)!.errors.name).toBe("timesheetWorkerOnOtherSheet");
    // ...and the template for this month only lists the worker still missing.
    expect((await timesheetWorkers(ctx, NOV.year, NOV.month, null, null)).map((w) => w.name)).toEqual(["Karim Mia"]);
    // Re-downloading for this sheet lists its workers with what was entered.
    const forSheet = await timesheetWorkers(ctx, NOV.year, NOV.month, null, sheet.id);
    expect(forSheet.find((w) => w.id === w1.id)?.existing?.advances).toBe(30000);
  });

  it("rejects a worker twice, absent days beyond the month and deductions above the salary", async () => {
    const { ctx } = await setup();
    const rows = await filledTimesheet(ctx, { "Rahim Uddin": { absentDays: "31" }, "Karim Mia": { advances: "5000" } }, [{ name: "Office Boy" }]);
    const preview = await previewTimesheet(ctx, { ...NOV, siteId: null, sheetId: null }, rows);
    expect(preview.rows.find((r) => r.values.name === "Rahim Uddin")!.errors.absentDays).toBe("invalidDays"); // November has 30 days
    expect(preview.rows.find((r) => r.values.name === "Karim Mia")!.errors.deductions).toBe("netNegative");
    const twice = preview.rows.filter((r) => r.values.name === "Office Boy");
    expect(twice.map((r) => r.errors.name)).toEqual([undefined, "timesheetWorkerTwice"]);
  });

  it("uploading again replaces the lines of a draft", async () => {
    const { ctx } = await setup();
    const first = await importTimesheet(ctx, { ...NOV, siteId: null, sheetId: null }, await filledTimesheet(ctx, {}));
    expect((await getSheet(ctx, first.sheetId)).workerCount).toBe(3);
    // Downloaded for the sheet, the template lists its workers again.
    expect(await timesheetWorkers(ctx, NOV.year, NOV.month, null, first.sheetId)).toHaveLength(3);
    // A file with only Rahim (matched by name) replaces the three lines.
    const rows = await filledTimesheet(ctx, {}, [{ name: "Rahim Uddin", overtimeHours: "4" }]);
    const replaced = await importTimesheet(ctx, { year: 0, month: 0, siteId: null, sheetId: first.sheetId }, rows);
    expect(replaced.sheetId).toBe(first.sheetId);
    const sheet = await getSheet(ctx, first.sheetId);
    expect(sheet.workerCount).toBe(1);
    expect(sheet.lines[0]!.overtimeHours).toBe(4000);
  });

  it("edit, approve → site-wise Salaries expenses, lock, reopen (owner only), delete draft", async () => {
    const { ctx, org, site, site2, w1, w2 } = await setup();
    const sheetId = await createSheetForActiveWorkers(ctx, { ...NOV, siteId: null });
    let sheet = await getSheet(ctx, sheetId);
    expect(sheet.workerCount).toBe(3);
    const line1 = sheet.lines.find((l) => l.workerId === w1.id)!;

    await updateLine(ctx, line1.id, { ...noInput, overtimeHours: 10000, advances: 20000 });
    await expect(updateLine(ctx, line1.id, { ...noInput, deductions: 999999 })).rejects.toMatchObject({ field: "deductions", code: "netNegative" });
    await expect(updateLine(ctx, line1.id, { ...noInput, absentDays: 31000 })).rejects.toBeInstanceOf(FieldError);
    sheet = await getSheet(ctx, sheetId);
    expect(sheet.lines.find((l) => l.id === line1.id)!.netPay).toBe(200000 + 11458 - 20000);
    expect(sheet.totalNet).toBe(sheet.lines.reduce((s, l) => s + l.netPay, 0));

    await approveSheet(ctx, sheetId, d("2026-12-01"));
    sheet = await getSheet(ctx, sheetId);
    expect(sheet.status).toBe("APPROVED");
    const entries = (await listEntries(ctx, { kind: "EXPENSE", categoryId: "", siteId: "", q: "", voided: false, period: { preset: "all", from: null, to: null }, page: 1 })).items;
    expect(entries).toHaveLength(3); // two sites + no site
    expect(entries.reduce((s, e) => s + e.amount, 0)).toBe(sheet.totalNet);
    expect(entries.every((e) => e.source === "SALARY_SHEET" && e.date.toISOString().startsWith("2026-12-01") && e.salarySheetId === sheetId)).toBe(true);
    const bySite = new Map(entries.map((e) => [e.siteId, e.amount]));
    expect(bySite.get(site.id)).toBe(191458);
    expect(bySite.get(site2.id)).toBe(180000);
    const report = await siteProfitReport(ctx, { preset: "all", from: null, to: null });
    expect(JSON.stringify(report)).toContain(site2.id);

    // Locked after approval.
    await expect(updateLine(ctx, line1.id, noInput)).rejects.toMatchObject({ code: "sheetLocked" });
    await expect(approveSheet(ctx, sheetId, d("2026-12-01"))).rejects.toMatchObject({ code: "sheetLocked" });
    await expect(deleteDraftSheet(ctx, sheetId)).rejects.toMatchObject({ code: "sheetLocked" });

    const accountant = await addMember(org.id, "ACCOUNTANT");
    await expect(reopenSheet(accountant.ctx, sheetId)).rejects.toBeInstanceOf(ForbiddenError);
    await reopenSheet(ctx, sheetId);
    expect((await getSheet(ctx, sheetId)).status).toBe("DRAFT");
    expect(await tenantDb(ctx.organizationId).financeEntry.count({ where: { salarySheetId: sheetId } })).toBe(0);
    await expect(reopenSheet(ctx, sheetId)).rejects.toMatchObject({ code: "sheetNotApproved" });

    // The accountant can edit and approve.
    await removeLine(accountant.ctx, sheet.lines.find((l) => l.workerId === w2.id)!.id);
    await approveSheet(accountant.ctx, sheetId, d("2026-12-02"));
    expect(await tenantDb(ctx.organizationId).financeEntry.count({ where: { salarySheetId: sheetId } })).toBe(2);

    await reopenSheet(ctx, sheetId);
    await deleteDraftSheet(ctx, sheetId);
    await expect(getSheet(ctx, sheetId)).rejects.toBeInstanceOf(NotFoundError);
    const audit = await tenantDb(ctx.organizationId).auditLog.findMany({ where: { entityId: sheetId }, select: { action: true } });
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["payroll.sheet_created", "payroll.line_updated", "payroll.sheet_approved", "payroll.sheet_reopened", "payroll.sheet_deleted"]));
  });

  it("add missing workers, refresh from workforce and rules, one sheet per worker per month", async () => {
    const { ctx, site, w1 } = await setup();
    const siteSheet = await createSheetForActiveWorkers(ctx, { ...NOV, siteId: site.id });
    expect((await getSheet(ctx, siteSheet)).lines.map((l) => l.workerId)).toEqual([w1.id]);
    const all = await createSheetForActiveWorkers(ctx, { ...NOV, siteId: null });
    expect((await getSheet(ctx, all)).workerCount).toBe(2);
    await expect(createSheetForActiveWorkers(ctx, { ...NOV, siteId: null })).rejects.toMatchObject({ code: "noWorkersForSheet" });
    expect(await addMissingWorkers(ctx, all)).toBe(0);
    await createWorker(ctx, workerInput("New Joiner", "2100000009", { ...pay }));
    expect(await addMissingWorkers(ctx, all)).toBe(1);
    // December is a new month: everyone is free again.
    expect((await getSheet(ctx, await createSheetForActiveWorkers(ctx, { year: 2026, month: 12, siteId: null }))).workerCount).toBe(4);

    // Salary raise and new rules reach a draft only when refreshed.
    const line = (await getSheet(ctx, siteSheet)).lines[0]!;
    await updateLine(ctx, line.id, { ...noInput, overtimeHours: 10000 });
    await updateWorker(ctx, w1.id, { ...workerInput("Rahim Uddin", "2100000001", { siteId: site.id, ...pay, basicSalary: 240000 }), iqamaNumber: undefined, clearPassport: false });
    await savePayrollSettings(ctx, { overtimeBase: "BASIC", overtimePremium: 5000, hoursPerDay: 8, monthDays: 30, absenceBase: "GROSS" });
    expect((await getSheet(ctx, siteSheet)).lines[0]!.basicSalary).toBe(150000);
    await refreshDraft(ctx, siteSheet);
    const refreshed = await getSheet(ctx, siteSheet);
    expect(refreshed.overtimeBase).toBe("BASIC");
    expect(refreshed.lines[0]).toMatchObject({ basicSalary: 240000, grossSalary: 290000, overtimeHours: 10000, overtimePay: 15000 }); // 2400/240 × 1.5 × 10
  });

  it("payroll rules: defaults, owner only", async () => {
    const { ctx, org } = await setup();
    const s = await getPayrollSettings(ctx);
    expect(s.saved).toBe(false);
    expect(s.rules).toEqual(DEFAULT);
    const accountant = await addMember(org.id, "ACCOUNTANT");
    await expect(savePayrollSettings(accountant.ctx, { ...DEFAULT, hoursPerDay: 9 })).rejects.toBeInstanceOf(ForbiddenError);
    await savePayrollSettings(ctx, { ...DEFAULT, monthDays: 0, hoursPerDay: 9 });
    const id = await createSheetForActiveWorkers(ctx, { year: 2026, month: 2, siteId: null });
    expect(await getSheet(ctx, id)).toMatchObject({ monthDays: 0, hoursPerDay: 9 });
  });

  it("is isolated per company, read-only mode blocks changes, and the database refuses bad numbers", async () => {
    const a = await setup("Alpha");
    const b = await orgWithSite("Beta");
    const sheetId = await createSheetForActiveWorkers(a.ctx, { ...NOV, siteId: null });
    const lineId = (await getSheet(a.ctx, sheetId)).lines[0]!.id;
    await expect(getSheet(b.ctx, sheetId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateLine(b.ctx, lineId, noInput)).rejects.toBeInstanceOf(NotFoundError);
    await expect(approveSheet(b.ctx, sheetId, d("2026-12-01"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(reopenSheet(b.ctx, sheetId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await listSheets(b.ctx, { q: "", year: null, status: "", page: 1 })).total).toBe(0);
    expect(await tenantDb(b.org.id).salarySheetLine.count()).toBe(0);
    // A worker of another company can never be put on a sheet (composite foreign key + RLS).
    await expect(
      tenantDb(b.org.id).salarySheetLine.create({
        data: { organizationId: b.org.id, sheetId, workerId: a.w1.id, year: 2026, month: 11, workerName: "x", iqamaLast4: "0001", basicSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0, grossSalary: 0, netPay: 0 },
      }),
    ).rejects.toThrow();

    const { ctx: expiredCtx } = await createOwnerWithOrg("Expired", new Date(Date.now() - 30 * DAY));
    const readOnly: OrgContext = { ...a.ctx, access: expiredCtx.access };
    await expect(approveSheet(readOnly, sheetId, d("2026-12-01"))).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(updateLine(readOnly, lineId, noInput)).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(createSheetForActiveWorkers(readOnly, { year: 2026, month: 10, siteId: null })).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await getSheet(readOnly, sheetId)).workerCount).toBe(3);

    // Net pay must equal its parts and cannot be negative, whatever the code does.
    await expect(tenantDb(a.org.id).salarySheetLine.update({ where: { id: lineId }, data: { netPay: 1 } })).rejects.toThrow();
    await expect(tenantDb(a.org.id).salarySheet.update({ where: { id: sheetId }, data: { status: "APPROVED" } })).rejects.toThrow(); // needs approvedAt + payDate
  });
});

describe("payroll: marking salaries as paid", () => {
  beforeEach(resetDb);

  it("after approval, marks one worker or the rest as paid, undo, and blocks reopening while paid", async () => {
    const { ctx, org, w1 } = await setup();
    const sheetId = await createSheetForActiveWorkers(ctx, { ...NOV, siteId: null });
    await expect(markPaid(ctx, sheetId, d("2026-12-01"), null)).rejects.toMatchObject({ code: "approveBeforePaying" });
    await approveSheet(ctx, sheetId, d("2026-11-30"));
    let sheet = await getSheet(ctx, sheetId);
    expect(paymentState(sheet)).toBe("NONE");
    expect(await unpaidSalaries(ctx)).toEqual({ amount: sheet.totalNet, sheets: 1 });

    const rahim = sheet.lines.find((l) => l.workerId === w1.id)!;
    expect(await markPaid(ctx, sheetId, d("2026-12-01"), rahim.id)).toBe(1);
    expect(await markPaid(ctx, sheetId, d("2026-12-05"), rahim.id)).toBe(0); // already paid, date kept
    sheet = await getSheet(ctx, sheetId);
    expect(sheet.paidNet).toBe(rahim.netPay);
    expect(paymentState(sheet)).toBe("PARTLY");
    expect(sheet.lines.find((l) => l.id === rahim.id)!.paidAt?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect((await unpaidSalaries(ctx)).amount).toBe(sheet.totalNet - rahim.netPay);

    await expect(reopenSheet(ctx, sheetId)).rejects.toMatchObject({ code: "sheetHasPaidWorkers" });

    const accountant = await addMember(org.id, "ACCOUNTANT");
    expect(await markPaid(accountant.ctx, sheetId, d("2026-12-02"), null)).toBe(2);
    sheet = await getSheet(ctx, sheetId);
    expect(paymentState(sheet)).toBe("PAID");
    expect(await unpaidSalaries(ctx)).toEqual({ amount: 0, sheets: 0 });

    // The payslip shows the paid date; Excel has a Paid on column.
    const html = renderPayslipsHtml(sheet, [sheet.lines.find((l) => l.id === rahim.id)!], { nameEn: "Co", nameAr: null, crNumber: null, addressLine: null, city: null }, { lang: "en", forPdf: true, logoDataUri: null });
    expect(html).toContain("Paid on");
    expect(html).toContain("01/12/2026");

    expect(await markUnpaid(ctx, sheetId, rahim.id)).toBe(1);
    expect((await getSheet(ctx, sheetId)).paidNet).toBe(sheet.totalNet - rahim.netPay);
    await markUnpaid(ctx, sheetId, null);
    expect((await getSheet(ctx, sheetId)).paidNet).toBe(0);
    await reopenSheet(ctx, sheetId);

    const audit = await tenantDb(ctx.organizationId).auditLog.findMany({ where: { entityId: sheetId }, select: { action: true } });
    expect(audit.filter((a) => a.action === "payroll.marked_paid")).toHaveLength(2);
    expect(audit.filter((a) => a.action === "payroll.marked_unpaid")).toHaveLength(2);

    // The database refuses a paid amount on a draft or above the net pay.
    await expect(tenantDb(ctx.organizationId).salarySheet.update({ where: { id: sheetId }, data: { paidNet: 1 } })).rejects.toThrow();
  });

  it("other companies and read-only mode cannot mark salaries as paid", async () => {
    const a = await setup("Alpha");
    const b = await orgWithSite("Beta");
    const sheetId = await createSheetForActiveWorkers(a.ctx, { ...NOV, siteId: null });
    await approveSheet(a.ctx, sheetId, d("2026-11-30"));
    await expect(markPaid(b.ctx, sheetId, d("2026-12-01"), null)).rejects.toBeInstanceOf(NotFoundError);
    const { ctx: expiredCtx } = await createOwnerWithOrg("Expired", new Date(Date.now() - 30 * DAY));
    await expect(markPaid({ ...a.ctx, access: expiredCtx.access }, sheetId, d("2026-12-01"), null)).rejects.toBeInstanceOf(ReadOnlyError);
  });
});

describe("payroll: exports", () => {
  beforeEach(resetDb);

  it("Excel export, salary sheet and payslips HTML (EN/AR) with masked Iqama and escaped text", async () => {
    const { ctx, org, w1 } = await setup();
    const sheetId = await createSheetForActiveWorkers(ctx, { ...NOV, siteId: null });
    const line = (await getSheet(ctx, sheetId)).lines.find((l) => l.workerId === w1.id)!;
    await updateLine(ctx, line.id, { ...noInput, overtimeHours: 5000, notes: "<script>alert(1)</script>" });
    const sheet = await getSheet(ctx, sheetId);

    const bytes = await buildSalarySheetWorkbook(sheet, { locale: "en", companyName: org.nameEn });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const last = ws.getRow(ws.rowCount);
    expect(last.getCell(2).value).toBe("Total");
    expect(Math.round(Number(last.getCell(18).value) * 100)).toBe(sheet.totalNet);

    const company = { nameEn: org.nameEn, nameAr: "شركة الرواتب", crNumber: null, addressLine: null, city: null };
    const opts = { forPdf: true, logoDataUri: null } as const;
    const sheetHtml = renderSalarySheetHtml(sheet, company, { ...opts, lang: "ar" });
    expect(sheetHtml).toContain('dir="rtl"');
    expect(sheetHtml).toContain("مسير الرواتب");
    expect(sheetHtml).toContain("&lt;script&gt;");
    expect(sheetHtml).not.toContain("<script>alert");
    expect(sheetHtml).not.toContain("2100000001");
    expect(sheetHtml).toContain("•••• 0001");

    const slips = renderPayslipsHtml(sheet, sheet.lines, company, { ...opts, lang: "en" });
    expect(slips.match(/class="page slip"/g)).toHaveLength(3);
    expect(slips).toContain("Payslip");
    expect(slips).toContain("قسيمة الراتب");
    expect(slips).not.toContain("2100000001");
  });
});
