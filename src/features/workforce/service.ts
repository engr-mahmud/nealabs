import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { blindIndex, decryptField, encryptField } from "@/lib/field-crypto";
import { FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { paged, paging, type ListQuery } from "@/features/master-data/list";
import { todayInRiyadh, warningLimit } from "@/features/master-data/expiry";
import { isValidIqama, type WorkerCreateInput, type WorkerFields, type WorkerUpdateInput } from "./schemas";

/**
 * Columns that are safe to send to pages. Encrypted numbers and their hash never
 * leave this module; pages show "•••• 1234" and the full number only on request.
 */
const safeSelect = {
  id: true,
  name: true,
  nameAr: true,
  iqamaLast4: true,
  nationality: true,
  jobTitle: true,
  phone: true,
  basicSalary: true,
  housingAllowance: true,
  transportAllowance: true,
  otherAllowance: true,
  siteId: true,
  iqamaExpiry: true,
  passportLast4: true,
  passportExpiry: true,
  archivedAt: true,
  createdAt: true,
  site: { select: { id: true, name: true, archivedAt: true, client: { select: { nameEn: true, nameAr: true } } } },
} satisfies Prisma.WorkerSelect;

export type WorkerView = Prisma.WorkerGetPayload<{ select: typeof safeSelect }>;

export type ExpiryFilter = "" | "soon" | "expired";

export interface WorkerListQuery extends ListQuery {
  siteId?: string;
  expiry?: ExpiryFilter;
}

function expiryWhere(filter: ExpiryFilter, today: Date): Prisma.WorkerWhereInput {
  if (filter === "expired") return { OR: [{ iqamaExpiry: { lt: today } }, { passportExpiry: { lt: today } }] };
  if (filter === "soon") {
    // Expired or expiring within the warning window: everything that needs action.
    const limit = warningLimit(today);
    return { OR: [{ iqamaExpiry: { lte: limit } }, { passportExpiry: { lte: limit } }] };
  }
  return {};
}

function searchWhere(organizationId: string, q: string): Prisma.WorkerWhereInput {
  if (!q) return {};
  const digits = q.replace(/\s+/g, "");
  // A full Iqama number is matched through its keyed hash, never stored or searched in plain text.
  if (isValidIqama(digits)) return { iqamaHash: blindIndex(organizationId, digits) };
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { nameAr: { contains: q, mode: "insensitive" } },
      { jobTitle: { contains: q, mode: "insensitive" } },
      { nationality: { contains: q, mode: "insensitive" } },
      { phone: { contains: digits } },
      ...(/^\d{4}$/.test(digits) ? [{ iqamaLast4: digits }] : []),
    ],
  };
}

export async function listWorkers(ctx: OrgContext, query: WorkerListQuery, now = new Date()) {
  assertCan(ctx, "data.read");
  const where: Prisma.WorkerWhereInput = {
    AND: [
      { archivedAt: query.archived ? { not: null } : null },
      query.siteId === "none" ? { siteId: null } : query.siteId ? { siteId: query.siteId } : {},
      expiryWhere(query.expiry ?? "", todayInRiyadh(now)),
      searchWhere(ctx.organizationId, query.q),
    ],
  };
  const db = tenantDb(ctx.organizationId);
  const [items, total] = await Promise.all([
    db.worker.findMany({ where, select: safeSelect, orderBy: { name: "asc" }, ...paging(query.page) }),
    db.worker.count({ where }),
  ]);
  return paged(items, total, query.page);
}

export async function getWorker(ctx: OrgContext, id: string): Promise<WorkerView> {
  assertCan(ctx, "data.read");
  const worker = await tenantDb(ctx.organizationId).worker.findFirst({ where: { id }, select: safeSelect });
  if (!worker) throw new NotFoundError();
  return worker;
}

/** Shows a full Iqama or passport number on request. Every view is written to the audit log. */
export async function revealWorkerDocument(ctx: OrgContext, id: string, document: "iqama" | "passport") {
  assertCan(ctx, "data.read");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const worker = await tx.worker.findFirst({ where: { id }, select: { iqamaEncrypted: true, passportEncrypted: true } });
    if (!worker) throw new NotFoundError();
    const stored = document === "iqama" ? worker.iqamaEncrypted : worker.passportEncrypted;
    if (!stored) return null;
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "worker.document_viewed",
      entityType: "Worker",
      entityId: id,
      metadata: { document },
    });
    return decryptField(stored);
  });
}

/** Encrypted columns for a new or changed Iqama number. */
export function iqamaColumns(organizationId: string, iqama: string) {
  return { iqamaEncrypted: encryptField(iqama), iqamaHash: blindIndex(organizationId, iqama), iqamaLast4: iqama.slice(-4) };
}

export function passportColumns(passport: string | null | undefined) {
  return passport ? { passportEncrypted: encryptField(passport), passportLast4: passport.slice(-4) } : { passportEncrypted: null, passportLast4: null };
}

async function assertIqamaFree(tx: TxClient, iqamaHash: string, exceptId?: string) {
  const existing = await tx.worker.findFirst({ where: { iqamaHash, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (existing) throw new FieldError("iqamaNumber", "iqamaTaken");
}

async function assertSiteUsable(tx: TxClient, siteId: string | null | undefined) {
  if (!siteId) return;
  const site = await tx.site.findFirst({ where: { id: siteId, archivedAt: null }, select: { id: true } });
  if (!site) throw new FieldError("siteId", "chooseSite");
}

/** Plain (non-sensitive) columns shared by create, update and import. */
export function plainColumns(input: Omit<WorkerFields, "iqamaNumber" | "passportNumber">) {
  return {
    name: input.name,
    nameAr: input.nameAr ?? null,
    nationality: input.nationality ?? null,
    jobTitle: input.jobTitle ?? null,
    phone: input.phone ?? null,
    basicSalary: input.basicSalary,
    housingAllowance: input.housingAllowance,
    transportAllowance: input.transportAllowance,
    otherAllowance: input.otherAllowance,
    iqamaExpiry: input.iqamaExpiry,
    passportExpiry: input.passportExpiry,
  };
}

export async function createWorker(ctx: OrgContext, input: WorkerCreateInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const iqama = iqamaColumns(ctx.organizationId, input.iqamaNumber);
    await assertIqamaFree(tx, iqama.iqamaHash);
    await assertSiteUsable(tx, input.siteId);
    const worker = await tx.worker.create({
      data: {
        organizationId: ctx.organizationId,
        ...plainColumns(input),
        ...iqama,
        ...passportColumns(input.passportNumber),
        siteId: input.siteId ?? null,
      },
      select: { id: true },
    });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "worker.created", entityType: "Worker", entityId: worker.id });
    return worker;
  });
}

export async function updateWorker(ctx: OrgContext, id: string, input: WorkerUpdateInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const current = await tx.worker.findFirst({ where: { id }, select: { id: true, siteId: true, basicSalary: true, housingAllowance: true, transportAllowance: true, otherAllowance: true } });
    if (!current) throw new NotFoundError();
    const data: Prisma.WorkerUncheckedUpdateInput = { ...plainColumns(input), siteId: input.siteId ?? null };
    if (input.iqamaNumber) {
      const iqama = iqamaColumns(ctx.organizationId, input.iqamaNumber);
      await assertIqamaFree(tx, iqama.iqamaHash, id);
      Object.assign(data, iqama);
    }
    if (input.passportNumber) Object.assign(data, passportColumns(input.passportNumber));
    else if (input.clearPassport) Object.assign(data, passportColumns(null));
    if (input.siteId && input.siteId !== current.siteId) await assertSiteUsable(tx, input.siteId);
    await tx.worker.update({ where: { id }, data });

    const salaryChanged = (["basicSalary", "housingAllowance", "transportAllowance", "otherAllowance"] as const).filter((k) => current[k] !== input[k]);
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "worker.updated",
      entityType: "Worker",
      entityId: id,
      // Salary changes are money actions: keep old and new amounts. Never log Iqama or passport numbers.
      metadata: {
        iqamaChanged: !!input.iqamaNumber,
        passportChanged: !!input.passportNumber || input.clearPassport,
        siteChanged: (input.siteId ?? null) !== current.siteId,
        salary: Object.fromEntries(salaryChanged.map((k) => [k, { from: current[k], to: input[k] }])),
      },
    });
  });
}

export async function setWorkerArchived(ctx: OrgContext, id: string, archived: boolean) {
  assertCan(ctx, "data.write");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const { count } = await tx.worker.updateMany({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    if (count === 0) throw new NotFoundError();
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: archived ? "worker.archived" : "worker.restored",
      entityType: "Worker",
      entityId: id,
    });
  });
}

export interface ExpiringDocument {
  workerId: string;
  name: string;
  document: "iqama" | "passport";
  expiresOn: Date;
}

/** Active workers' documents that are expired or expire within the warning window, soonest first. */
export async function listExpiringDocuments(ctx: OrgContext, now = new Date()) {
  assertCan(ctx, "data.read");
  const today = todayInRiyadh(now);
  const limit = warningLimit(today);
  const workers = await tenantDb(ctx.organizationId).worker.findMany({
    where: { archivedAt: null, OR: [{ iqamaExpiry: { lte: limit } }, { passportExpiry: { lte: limit } }] },
    select: { id: true, name: true, iqamaExpiry: true, passportExpiry: true },
  });
  return collectExpiring(workers, limit);
}

export function collectExpiring(
  workers: { id: string; name: string; iqamaExpiry: Date | null; passportExpiry: Date | null }[],
  limit: Date,
): ExpiringDocument[] {
  const docs: ExpiringDocument[] = [];
  for (const w of workers) {
    if (w.iqamaExpiry && w.iqamaExpiry <= limit) docs.push({ workerId: w.id, name: w.name, document: "iqama", expiresOn: w.iqamaExpiry });
    if (w.passportExpiry && w.passportExpiry <= limit) docs.push({ workerId: w.id, name: w.name, document: "passport", expiresOn: w.passportExpiry });
  }
  return docs.sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime());
}

export async function countActiveSitesAndWorkers(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  const db = tenantDb(ctx.organizationId);
  const [sites, workers] = await Promise.all([db.site.count({ where: { archivedAt: null } }), db.worker.count({ where: { archivedAt: null } })]);
  return { sites, workers };
}
