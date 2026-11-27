import { Prisma } from "@/generated/prisma/client";
import type { SalarySheetStatus } from "@/generated/prisma/enums";
import { payrollConfig } from "@/config/payroll";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { AppError, FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { recordSalarySheetExpenses, removeSalarySheetExpenses } from "@/features/finance/service";
import type { SheetRow } from "@/features/import/excel";
import { computeSalary, daysInMonth, periodKey, sumLines, type PayrollRulesFull, type SalaryInput } from "./calc";
import { lineInputSchema, type LineInput, type SettingsInput } from "./schemas";

// ---------------------------------------------------------------- settings

export async function readRules(tx: TxClient): Promise<PayrollRulesFull> {
  const s = await tx.payrollSettings.findFirst();
  const d = payrollConfig.defaults;
  return s
    ? { overtimeBase: s.overtimeBase, overtimePremium: s.overtimePremium, hoursPerDay: s.hoursPerDay, monthDays: s.monthDays, absenceBase: s.absenceBase }
    : { overtimeBase: d.overtimeBase, overtimePremium: d.overtimePremium, hoursPerDay: d.hoursPerDay, monthDays: d.monthDays, absenceBase: d.absenceBase };
}

export async function getPayrollSettings(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const saved = await tx.payrollSettings.findFirst({ select: { updatedAt: true } });
    return { rules: await readRules(tx), saved: !!saved, updatedAt: saved?.updatedAt ?? null };
  });
}

/** Only the owner sets the rules. They apply to new sheets and to drafts when refreshed. */
export async function savePayrollSettings(ctx: OrgContext, input: SettingsInput) {
  assertCan(ctx, "org.update");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const before = await readRules(tx);
    const data = { ...input, updatedById: ctx.userId };
    await tx.payrollSettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.settings_updated", entityType: "PayrollSettings", entityId: ctx.organizationId, metadata: { before: { ...before }, after: { ...input } } });
  });
}

// ---------------------------------------------------------------- reading sheets

export interface SheetListQuery {
  q: string;
  year: number | null;
  status: SalarySheetStatus | "";
  page: number;
}

export async function listSheets(ctx: OrgContext, query: SheetListQuery) {
  assertCan(ctx, "data.read");
  const where: Prisma.SalarySheetWhereInput = {
    ...(query.year ? { year: query.year } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { site: { name: { contains: query.q, mode: "insensitive" } } },
            { notes: { contains: query.q, mode: "insensitive" } },
            { lines: { some: { OR: [{ workerName: { contains: query.q, mode: "insensitive" } }, { workerNameAr: { contains: query.q, mode: "insensitive" } }, { iqamaLast4: query.q }] } } },
          ],
        }
      : {}),
  };
  const take = payrollConfig.pageSize;
  const db = tenantDb(ctx.organizationId);
  const [items, total, years] = await Promise.all([
    db.salarySheet.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      take,
      skip: (query.page - 1) * take,
      select: { id: true, year: true, month: true, status: true, workerCount: true, totalNet: true, payDate: true, notes: true, site: { select: { name: true } } },
    }),
    db.salarySheet.count({ where }),
    db.salarySheet.findMany({ distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } }),
  ]);
  return { items, total, page: query.page, pageCount: Math.max(1, Math.ceil(total / take)), years: years.map((y) => y.year) };
}

const sheetInclude = {
  site: { select: { id: true, name: true } },
  lines: { orderBy: [{ siteName: { sort: "asc", nulls: "last" } }, { workerName: "asc" }] },
} satisfies Prisma.SalarySheetInclude;

export type SalarySheetDetail = Prisma.SalarySheetGetPayload<{ include: typeof sheetInclude }>;
export type SalaryLine = SalarySheetDetail["lines"][number];

export async function getSheet(ctx: OrgContext, id: string): Promise<SalarySheetDetail> {
  assertCan(ctx, "data.read");
  const sheet = await tenantDb(ctx.organizationId).salarySheet.findFirst({ where: { id }, include: sheetInclude });
  if (!sheet) throw new NotFoundError();
  return sheet;
}

export function sheetRules(sheet: PayrollRulesFull): PayrollRulesFull {
  return { overtimeBase: sheet.overtimeBase, overtimePremium: sheet.overtimePremium, hoursPerDay: sheet.hoursPerDay, monthDays: sheet.monthDays, absenceBase: sheet.absenceBase };
}

// ---------------------------------------------------------------- shared helpers

const workerSelect = {
  id: true,
  name: true,
  nameAr: true,
  iqamaLast4: true,
  jobTitle: true,
  basicSalary: true,
  housingAllowance: true,
  transportAllowance: true,
  otherAllowance: true,
  siteId: true,
  archivedAt: true,
  site: { select: { name: true } },
} satisfies Prisma.WorkerSelect;
type WorkerRow = Prisma.WorkerGetPayload<{ select: typeof workerSelect }>;

/** Worker details copied onto the line, so later edits of the worker do not change the sheet. */
function snapshot(w: WorkerRow) {
  return {
    workerName: w.name,
    workerNameAr: w.nameAr,
    iqamaLast4: w.iqamaLast4,
    jobTitle: w.jobTitle,
    siteId: w.siteId,
    siteName: w.site?.name ?? null,
    basicSalary: w.basicSalary,
    housingAllowance: w.housingAllowance,
    transportAllowance: w.transportAllowance,
    otherAllowance: w.otherAllowance,
  };
}

const ZERO_INPUT: LineInput = { absentDays: 0, overtimeHours: 0, additions: 0, advances: 0, deductions: 0, notes: null };

type Amounts = Pick<SalaryInput, "basicSalary" | "housingAllowance" | "transportAllowance" | "otherAllowance">;

function calculate(rules: PayrollRulesFull, year: number, month: number, amounts: Amounts, input: LineInput) {
  const result = computeSalary(
    rules,
    {
      basicSalary: amounts.basicSalary,
      housingAllowance: amounts.housingAllowance,
      transportAllowance: amounts.transportAllowance,
      otherAllowance: amounts.otherAllowance,
      absentDays: input.absentDays,
      overtimeHours: input.overtimeHours,
      additions: input.additions,
      advances: input.advances,
      deductions: input.deductions,
    },
    year,
    month,
  );
  return { ...result, absentDays: input.absentDays, overtimeHours: input.overtimeHours, additions: input.additions, advances: input.advances, deductions: input.deductions, notes: input.notes ?? null };
}

/** Locks the sheet row for this transaction and checks it is still a draft. */
async function lockDraft(tx: TxClient, sheetId: string) {
  const rows = await tx.$queryRaw<{ status: SalarySheetStatus }[]>`SELECT status FROM salary_sheets WHERE id = ${sheetId} FOR UPDATE`;
  if (rows.length === 0) throw new NotFoundError();
  if (rows[0]?.status !== "DRAFT") throw new AppError("sheetLocked");
  const sheet = await tx.salarySheet.findFirst({ where: { id: sheetId } });
  if (!sheet) throw new NotFoundError();
  return sheet;
}

/** Keeps the sheet totals equal to the sum of its lines (the database checks they add up). */
async function refreshTotals(tx: TxClient, sheetId: string) {
  const lines = await tx.salarySheetLine.findMany({
    where: { sheetId },
    select: { grossSalary: true, absenceDeduction: true, overtimePay: true, netPay: true, additions: true, advances: true, deductions: true },
  });
  const totals = sumLines(lines);
  await tx.salarySheet.update({ where: { id: sheetId }, data: totals });
  return totals;
}

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Workers who are already on a sheet of this month (other than `exceptSheetId`), by worker id → sheet id. */
async function workersOnOtherSheets(tx: TxClient, year: number, month: number, exceptSheetId?: string) {
  const lines = await tx.salarySheetLine.findMany({
    where: { year, month, ...(exceptSheetId ? { sheetId: { not: exceptSheetId } } : {}) },
    select: { workerId: true, sheetId: true },
  });
  return new Map(lines.map((l) => [l.workerId, l.sheetId]));
}

async function assertSiteExists(tx: TxClient, siteId: string | null) {
  if (!siteId) return;
  const site = await tx.site.findFirst({ where: { id: siteId }, select: { id: true } });
  if (!site) throw new FieldError("siteId", "chooseSite");
}

// ---------------------------------------------------------------- timesheet (Excel)

/** Active workers to put on the timesheet template for a month (and site), skipping those on other sheets. */
export async function timesheetWorkers(ctx: OrgContext, year: number, month: number, siteId: string | null, sheetId: string | null) {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const busy = await workersOnOtherSheets(tx, year, month, sheetId ?? undefined);
    const existing = sheetId ? await tx.salarySheetLine.findMany({ where: { sheetId } }) : [];
    const onSheet = new Map(existing.map((l) => [l.workerId, l]));
    const workers = await tx.worker.findMany({
      where: { OR: [{ archivedAt: null, ...(siteId ? { siteId } : {}) }, { id: { in: [...onSheet.keys()] } }] },
      select: workerSelect,
      orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
    });
    return workers
      .filter((w) => !busy.has(w.id))
      .map((w) => {
        const line = onSheet.get(w.id);
        return {
          id: w.id,
          name: w.name,
          iqamaLast4: w.iqamaLast4,
          siteName: w.site?.name ?? null,
          monthlySalary: w.basicSalary + w.housingAllowance + w.transportAllowance + w.otherAllowance,
          existing: line ? { absentDays: line.absentDays, overtimeHours: line.overtimeHours, additions: line.additions, advances: line.advances, deductions: line.deductions, notes: line.notes } : undefined,
        };
      });
  });
}

export interface CheckedTimesheetRow {
  rowNumber: number;
  values: Record<string, string>;
  /** Field key → error code (translated by the action). "name" holds worker errors. */
  errors: Record<string, string>;
  workerId: string | null;
  netPay: number | null;
}

interface CheckedInternal extends CheckedTimesheetRow {
  input: LineInput | null;
  worker: WorkerRow | null;
}

async function checkTimesheet(tx: TxClient, rules: PayrollRulesFull, target: { year: number; month: number; sheetId: string | null }, rows: SheetRow[]): Promise<CheckedInternal[]> {
  const workers = await tx.worker.findMany({ select: workerSelect });
  const byId = new Map(workers.map((w) => [w.id, w]));
  const activeByName = new Map<string, WorkerRow[]>();
  for (const w of workers) {
    if (w.archivedAt) continue;
    const key = w.name.trim().toLowerCase();
    activeByName.set(key, [...(activeByName.get(key) ?? []), w]);
  }
  const busy = await workersOnOtherSheets(tx, target.year, target.month, target.sheetId ?? undefined);
  const seen = new Set<string>();

  return rows.map((row) => {
    const errors: Record<string, string> = {};
    const ref = (row.values.workerRef ?? "").trim();
    let worker: WorkerRow | null = null;
    if (ref) {
      worker = byId.get(ref) ?? null;
      if (!worker) errors.name = "timesheetWorkerUnknown";
    } else {
      const matches = activeByName.get((row.values.name ?? "").trim().toLowerCase()) ?? [];
      if (matches.length === 1) worker = matches[0] ?? null;
      else errors.name = matches.length > 1 ? "timesheetWorkerAmbiguous" : "timesheetWorkerUnknown";
    }
    if (worker) {
      if (worker.archivedAt) errors.name = "timesheetWorkerArchived";
      else if (seen.has(worker.id)) errors.name = "timesheetWorkerTwice";
      else if (busy.has(worker.id)) errors.name = "timesheetWorkerOnOtherSheet";
      seen.add(worker.id);
    }

    const parsed = lineInputSchema.safeParse({
      absentDays: row.values.absentDays ?? "",
      overtimeHours: row.values.overtimeHours ?? "",
      additions: row.values.additions ?? "",
      advances: row.values.advances ?? "",
      deductions: row.values.deductions ?? "",
      notes: row.values.notes ?? "",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    }
    let netPay: number | null = null;
    if (parsed.success && worker && !errors.name) {
      if (parsed.data.absentDays > daysInMonth(target.year, target.month) * 1000) errors.absentDays = "invalidDays";
      const calc = calculate(rules, target.year, target.month, worker, parsed.data);
      netPay = calc.netPay;
      if (calc.netPay < 0) errors.deductions = "netNegative";
    }
    return { rowNumber: row.rowNumber, values: row.values, errors, workerId: worker?.id ?? null, netPay, input: parsed.success ? parsed.data : null, worker };
  });
}

const publicRow = ({ rowNumber, values, errors, workerId, netPay }: CheckedInternal): CheckedTimesheetRow => ({ rowNumber, values, errors, workerId, netPay });

export interface TimesheetTarget {
  year: number;
  month: number;
  siteId: string | null;
  /** Replace the lines of this draft instead of making a new sheet. */
  sheetId: string | null;
}

async function resolveTarget(tx: TxClient, target: TimesheetTarget) {
  if (!target.sheetId) {
    await assertSiteExists(tx, target.siteId);
    return { ...target, rules: await readRules(tx) };
  }
  const sheet = await lockDraft(tx, target.sheetId);
  return { year: sheet.year, month: sheet.month, siteId: sheet.siteId, sheetId: sheet.id, rules: sheetRules(sheet) };
}

export async function previewTimesheet(ctx: OrgContext, target: TimesheetTarget, rows: SheetRow[]) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const t = await resolveTarget(tx, target);
    const checked = await checkTimesheet(tx, t.rules, t, rows);
    const valid = checked.filter((r) => Object.keys(r.errors).length === 0);
    return { rows: checked.map(publicRow), validCount: valid.length, errorCount: checked.length - valid.length, totalNet: valid.reduce((s, r) => s + (r.netPay ?? 0), 0) };
  });
}

/**
 * Saves the valid rows of a timesheet as a draft salary sheet (or replaces the lines of
 * an existing draft). The file is checked again on the server; the preview is never trusted.
 */
export async function importTimesheet(ctx: OrgContext, target: TimesheetTarget, rows: SheetRow[]) {
  assertCan(ctx, "data.write");
  try {
    return await tenantTransaction(
      ctx.organizationId,
      async (tx) => {
        const t = await resolveTarget(tx, target);
        const checked = await checkTimesheet(tx, t.rules, t, rows);
        const valid = checked.filter((r) => Object.keys(r.errors).length === 0 && r.worker && r.input);
        if (valid.length === 0) throw new AppError("timesheetNothingValid");
        let sheetId = t.sheetId;
        if (sheetId) {
          await tx.salarySheetLine.deleteMany({ where: { sheetId } });
          await tx.salarySheet.update({ where: { id: sheetId }, data: { ...t.rules } });
        } else {
          const sheet = await tx.salarySheet.create({ data: { organizationId: ctx.organizationId, year: t.year, month: t.month, siteId: t.siteId, ...t.rules, createdById: ctx.userId } });
          sheetId = sheet.id;
        }
        await tx.salarySheetLine.createMany({
          data: valid.map((r) => ({
            organizationId: ctx.organizationId,
            sheetId: sheetId as string,
            workerId: r.worker!.id,
            year: t.year,
            month: t.month,
            ...snapshot(r.worker!),
            ...calculate(t.rules, t.year, t.month, r.worker!, r.input!),
          })),
        });
        const totals = await refreshTotals(tx, sheetId);
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: t.sheetId ? "payroll.timesheet_replaced" : "payroll.sheet_created",
          entityType: "SalarySheet",
          entityId: sheetId,
          metadata: { period: periodKey(t.year, t.month), source: "excel", workers: totals.workerCount, totalNet: totals.totalNet, skipped: checked.length - valid.length },
        });
        return { sheetId, imported: valid.length, skipped: checked.length - valid.length };
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("timesheetWorkerOnOtherSheet");
    throw e;
  }
}

// ---------------------------------------------------------------- sheets without Excel

/** A draft with every active worker (of the site, if given) who is not on another sheet this month. */
export async function createSheetForActiveWorkers(ctx: OrgContext, input: { year: number; month: number; siteId: string | null }) {
  assertCan(ctx, "data.write");
  try {
    return await tenantTransaction(
      ctx.organizationId,
      async (tx) => {
        await assertSiteExists(tx, input.siteId);
        const rules = await readRules(tx);
        const busy = await workersOnOtherSheets(tx, input.year, input.month);
        const workers = (await tx.worker.findMany({ where: { archivedAt: null, ...(input.siteId ? { siteId: input.siteId } : {}) }, select: workerSelect })).filter((w) => !busy.has(w.id));
        if (workers.length === 0) throw new AppError("noWorkersForSheet");
        const sheet = await tx.salarySheet.create({ data: { organizationId: ctx.organizationId, year: input.year, month: input.month, siteId: input.siteId, ...rules, createdById: ctx.userId } });
        await tx.salarySheetLine.createMany({
          data: workers.map((w) => ({ organizationId: ctx.organizationId, sheetId: sheet.id, workerId: w.id, year: input.year, month: input.month, ...snapshot(w), ...calculate(rules, input.year, input.month, w, ZERO_INPUT) })),
        });
        const totals = await refreshTotals(tx, sheet.id);
        await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.sheet_created", entityType: "SalarySheet", entityId: sheet.id, metadata: { period: periodKey(input.year, input.month), source: "workforce", workers: totals.workerCount, totalNet: totals.totalNet } });
        return sheet.id;
      },
      { timeout: 30_000 },
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("timesheetWorkerOnOtherSheet");
    throw e;
  }
}

/** Adds active workers (of the sheet's site) who are not on any sheet of this month yet. */
export async function addMissingWorkers(ctx: OrgContext, sheetId: string) {
  assertCan(ctx, "data.write");
  try {
    return await tenantTransaction(ctx.organizationId, async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      const rules = sheetRules(sheet);
      const busy = await workersOnOtherSheets(tx, sheet.year, sheet.month);
      const workers = (await tx.worker.findMany({ where: { archivedAt: null, ...(sheet.siteId ? { siteId: sheet.siteId } : {}) }, select: workerSelect })).filter((w) => !busy.has(w.id));
      if (workers.length === 0) return 0;
      await tx.salarySheetLine.createMany({
        data: workers.map((w) => ({ organizationId: ctx.organizationId, sheetId, workerId: w.id, year: sheet.year, month: sheet.month, ...snapshot(w), ...calculate(rules, sheet.year, sheet.month, w, ZERO_INPUT) })),
      });
      await refreshTotals(tx, sheetId);
      await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.workers_added", entityType: "SalarySheet", entityId: sheetId, metadata: { workers: workers.length } });
      return workers.length;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("timesheetWorkerOnOtherSheet");
    throw e;
  }
}

/**
 * Takes the current salaries and sites from Workforce and the current payroll rules,
 * and recalculates every line of a draft. Inputs (absences, overtime, money) are kept.
 */
export async function refreshDraft(ctx: OrgContext, sheetId: string) {
  assertCan(ctx, "data.write");
  return tenantTransaction(
    ctx.organizationId,
    async (tx) => {
      const sheet = await lockDraft(tx, sheetId);
      const rules = await readRules(tx);
      const lines = await tx.salarySheetLine.findMany({ where: { sheetId } });
      const workers = new Map((await tx.worker.findMany({ where: { id: { in: lines.map((l) => l.workerId) } }, select: workerSelect })).map((w) => [w.id, w]));
      let negative = 0;
      for (const line of lines) {
        const w = workers.get(line.workerId);
        const amounts = w ? snapshot(w) : line;
        const calc = calculate(rules, sheet.year, sheet.month, amounts, line);
        if (calc.netPay < 0) {
          negative += 1;
          continue; // keep the old numbers; the user fixes the line by hand
        }
        await tx.salarySheetLine.update({ where: { id: line.id }, data: { ...(w ? snapshot(w) : {}), ...calc } });
      }
      await tx.salarySheet.update({ where: { id: sheetId }, data: rules });
      const totals = await refreshTotals(tx, sheetId);
      await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.sheet_refreshed", entityType: "SalarySheet", entityId: sheetId, metadata: { totalNet: totals.totalNet, skipped: negative } });
      return { skipped: negative };
    },
    { timeout: 30_000 },
  );
}

// ---------------------------------------------------------------- editing a draft

export async function updateLine(ctx: OrgContext, lineId: string, input: LineInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const line = await tx.salarySheetLine.findFirst({ where: { id: lineId } });
    if (!line) throw new NotFoundError();
    const sheet = await lockDraft(tx, line.sheetId);
    if (input.absentDays > daysInMonth(sheet.year, sheet.month) * 1000) throw new FieldError("absentDays", "invalidDays");
    const calc = calculate(sheetRules(sheet), sheet.year, sheet.month, line, input);
    if (calc.netPay < 0) throw new FieldError("deductions", "netNegative");
    await tx.salarySheetLine.update({ where: { id: lineId }, data: calc });
    await refreshTotals(tx, sheet.id);
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "payroll.line_updated",
      entityType: "SalarySheet",
      entityId: sheet.id,
      metadata: {
        lineId,
        worker: line.workerName,
        before: { absentDays: line.absentDays, overtimeHours: line.overtimeHours, additions: line.additions, advances: line.advances, deductions: line.deductions, netPay: line.netPay },
        after: { absentDays: calc.absentDays, overtimeHours: calc.overtimeHours, additions: calc.additions, advances: calc.advances, deductions: calc.deductions, netPay: calc.netPay },
      },
    });
    return { sheetId: sheet.id };
  });
}

export async function removeLine(ctx: OrgContext, lineId: string) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const line = await tx.salarySheetLine.findFirst({ where: { id: lineId } });
    if (!line) throw new NotFoundError();
    await lockDraft(tx, line.sheetId);
    await tx.salarySheetLine.delete({ where: { id: lineId } });
    await refreshTotals(tx, line.sheetId);
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.line_removed", entityType: "SalarySheet", entityId: line.sheetId, metadata: { lineId, worker: line.workerName, netPay: line.netPay } });
    return { sheetId: line.sheetId };
  });
}

export async function updateSheetNotes(ctx: OrgContext, sheetId: string, notes: string | null) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    await lockDraft(tx, sheetId);
    await tx.salarySheet.update({ where: { id: sheetId }, data: { notes } });
  });
}

/** Drafts hold no money yet, so they can be deleted. Approved sheets must be reopened first. */
export async function deleteDraftSheet(ctx: OrgContext, sheetId: string) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const sheet = await lockDraft(tx, sheetId);
    await tx.salarySheet.delete({ where: { id: sheetId } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.sheet_deleted", entityType: "SalarySheet", entityId: sheetId, metadata: { period: periodKey(sheet.year, sheet.month), workers: sheet.workerCount, totalNet: sheet.totalNet } });
  });
}

// ---------------------------------------------------------------- approve and reopen

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function sheetLabelEn(sheet: { year: number; month: number; site?: { name: string } | null }) {
  return `Salaries ${MONTHS_EN[sheet.month - 1]} ${sheet.year}${sheet.site ? ` – ${sheet.site.name}` : ""}`;
}

/**
 * Locks the sheet and records its net pay as "Salaries" expenses, one per site, dated on
 * the pay date. Both happen in one transaction, so the books always match the sheet.
 */
export async function approveSheet(ctx: OrgContext, sheetId: string, payDate: Date) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const sheet = await lockDraft(tx, sheetId);
    const lines = await tx.salarySheetLine.findMany({ where: { sheetId }, select: { siteId: true, netPay: true } });
    if (lines.length === 0) throw new AppError("sheetEmpty");
    const site = sheet.siteId ? await tx.site.findFirst({ where: { id: sheet.siteId }, select: { name: true } }) : null;
    await tx.salarySheet.update({ where: { id: sheetId }, data: { status: "APPROVED", payDate, approvedAt: new Date(), approvedById: ctx.userId } });
    await recordSalarySheetExpenses(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      salarySheetId: sheetId,
      date: payDate,
      description: sheetLabelEn({ ...sheet, site }),
      lines: lines.map((l) => ({ siteId: l.siteId, amount: l.netPay })),
    });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.sheet_approved", entityType: "SalarySheet", entityId: sheetId, metadata: { period: periodKey(sheet.year, sheet.month), workers: lines.length, totalNet: sheet.totalNet, payDate: payDate.toISOString().slice(0, 10) } });
  });
}

/** Owner only: back to draft for corrections. The sheet's expenses are taken out of Finance. */
export async function reopenSheet(ctx: OrgContext, sheetId: string) {
  assertCan(ctx, "payroll.reopen");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const updated = await tx.salarySheet.updateMany({ where: { id: sheetId, status: "APPROVED" }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
    if (updated.count === 0) {
      const exists = await tx.salarySheet.findFirst({ where: { id: sheetId }, select: { id: true } });
      if (!exists) throw new NotFoundError();
      throw new AppError("sheetNotApproved");
    }
    const removed = await removeSalarySheetExpenses(tx, ctx.organizationId, sheetId, ctx.userId);
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.sheet_reopened", entityType: "SalarySheet", entityId: sheetId, metadata: { expensesRemoved: removed } });
  });
}

/** Written when salary data leaves the app (Excel or PDF), because salaries are personal data. */
export async function logPayrollExport(ctx: OrgContext, sheetId: string, format: string) {
  await tenantTransaction(ctx.organizationId, (tx) => writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "payroll.exported", entityType: "SalarySheet", entityId: sheetId, metadata: { format } }));
}

/** Sites for the "new sheet" form. */
export async function siteOptions(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).site.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, client: { select: { nameEn: true, nameAr: true } } },
    orderBy: { name: "asc" },
  });
}
