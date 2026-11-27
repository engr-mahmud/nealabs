import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { paged, paging, type ListQuery } from "@/features/master-data/list";
import type { ClientInput } from "./schemas";

export async function listClients(ctx: OrgContext, query: ListQuery) {
  assertCan(ctx, "data.read");
  const where: Prisma.ClientWhereInput = {
    archivedAt: query.archived ? { not: null } : null,
    ...(query.q
      ? {
          OR: [
            { nameEn: { contains: query.q, mode: "insensitive" } },
            { nameAr: { contains: query.q, mode: "insensitive" } },
            { contactName: { contains: query.q, mode: "insensitive" } },
            { vatNumber: { contains: query.q } },
            { city: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const db = tenantDb(ctx.organizationId);
  const [items, total] = await Promise.all([
    db.client.findMany({
      where,
      orderBy: { nameEn: "asc" },
      ...paging(query.page),
      include: { _count: { select: { sites: { where: { archivedAt: null } } } } },
    }),
    db.client.count({ where }),
  ]);
  return paged(items, total, query.page);
}

export async function getClient(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.read");
  const client = await tenantDb(ctx.organizationId).client.findFirst({
    where: { id },
    include: {
      sites: {
        orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { name: "asc" }],
        include: { _count: { select: { workers: { where: { archivedAt: null } } } } },
      },
    },
  });
  if (!client) throw new NotFoundError();
  return client;
}

/** Active clients for drop-downs. */
export async function listClientOptions(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).client.findMany({
    where: { archivedAt: null },
    select: { id: true, nameEn: true, nameAr: true },
    orderBy: { nameEn: "asc" },
  });
}

async function assertNameFree(tx: TxClient, nameEn: string, exceptId?: string) {
  const existing = await tx.client.findFirst({
    where: { nameEn: { equals: nameEn, mode: "insensitive" }, archivedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing) throw new FieldError("nameEn", "clientExists");
}

export async function createClient(ctx: OrgContext, input: ClientInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    await assertNameFree(tx, input.nameEn);
    const client = await tx.client.create({ data: { ...input, organizationId: ctx.organizationId } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "client.created", entityType: "Client", entityId: client.id });
    return client;
  });
}

export async function updateClient(ctx: OrgContext, id: string, input: ClientInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const current = await tx.client.findFirst({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundError();
    await assertNameFree(tx, input.nameEn, id);
    const client = await tx.client.update({ where: { id }, data: input });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "client.updated",
      entityType: "Client",
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return client;
  });
}

/** Archive (soft delete) or restore. Archiving a client also archives its sites; nothing is deleted. */
export async function setClientArchived(ctx: OrgContext, id: string, archived: boolean) {
  assertCan(ctx, "data.write");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const client = await tx.client.findFirst({ where: { id }, select: { id: true, nameEn: true, archivedAt: true } });
    if (!client) throw new NotFoundError();
    if (archived) {
      const now = new Date();
      await tx.client.update({ where: { id }, data: { archivedAt: now } });
      await tx.site.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: now } });
    } else {
      if (client.archivedAt) await assertNameFree(tx, client.nameEn, id);
      await tx.client.update({ where: { id }, data: { archivedAt: null } });
    }
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: archived ? "client.archived" : "client.restored",
      entityType: "Client",
      entityId: id,
    });
  });
}
