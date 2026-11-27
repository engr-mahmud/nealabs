import type { Prisma } from "@/generated/prisma/client";
import { tenantDb, tenantTransaction, type TxClient } from "@/lib/db";
import { FieldError, NotFoundError } from "@/lib/errors";
import { writeAudit } from "@/features/audit/log";
import { assertCan, type OrgContext } from "@/features/organizations/context";
import { paged, paging, type ListQuery } from "@/features/master-data/list";
import type { SiteInput } from "./schemas";

export async function listSites(ctx: OrgContext, query: ListQuery & { clientId?: string }) {
  assertCan(ctx, "data.read");
  const where: Prisma.SiteWhereInput = {
    archivedAt: query.archived ? { not: null } : null,
    ...(query.clientId ? { clientId: query.clientId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { city: { contains: query.q, mode: "insensitive" } },
            { client: { nameEn: { contains: query.q, mode: "insensitive" } } },
            { client: { nameAr: { contains: query.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const db = tenantDb(ctx.organizationId);
  const [items, total] = await Promise.all([
    db.site.findMany({
      where,
      orderBy: [{ client: { nameEn: "asc" } }, { name: "asc" }],
      ...paging(query.page),
      include: {
        client: { select: { id: true, nameEn: true, nameAr: true } },
        _count: { select: { workers: { where: { archivedAt: null } } } },
      },
    }),
    db.site.count({ where }),
  ]);
  return paged(items, total, query.page);
}

export async function getSite(ctx: OrgContext, id: string) {
  assertCan(ctx, "data.read");
  const site = await tenantDb(ctx.organizationId).site.findFirst({
    where: { id },
    include: {
      client: { select: { id: true, nameEn: true, nameAr: true, archivedAt: true } },
      _count: { select: { workers: { where: { archivedAt: null } } } },
    },
  });
  if (!site) throw new NotFoundError();
  return site;
}

/** Active sites for drop-downs, with their client's name. */
export async function listSiteOptions(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return tenantDb(ctx.organizationId).site.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, client: { select: { nameEn: true, nameAr: true } } },
    orderBy: [{ client: { nameEn: "asc" } }, { name: "asc" }],
  });
}

async function checkClientAndName(tx: TxClient, input: SiteInput, exceptId?: string) {
  // RLS limits the lookup to this organization, so a foreign client id is simply "not found".
  const client = await tx.client.findFirst({ where: { id: input.clientId, archivedAt: null }, select: { id: true } });
  if (!client) throw new FieldError("clientId", "chooseClient");
  const duplicate = await tx.site.findFirst({
    where: { clientId: input.clientId, archivedAt: null, name: { equals: input.name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new FieldError("name", "siteExists");
}

export async function createSite(ctx: OrgContext, input: SiteInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    await checkClientAndName(tx, input);
    const site = await tx.site.create({ data: { ...input, organizationId: ctx.organizationId } });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "site.created", entityType: "Site", entityId: site.id });
    return site;
  });
}

export async function updateSite(ctx: OrgContext, id: string, input: SiteInput) {
  assertCan(ctx, "data.write");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const current = await tx.site.findFirst({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundError();
    await checkClientAndName(tx, input, id);
    const site = await tx.site.update({ where: { id }, data: input });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "site.updated",
      entityType: "Site",
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return site;
  });
}

/** Archive or restore a site. Workers keep their site so history stays correct. */
export async function setSiteArchived(ctx: OrgContext, id: string, archived: boolean) {
  assertCan(ctx, "data.write");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const site = await tx.site.findFirst({ where: { id }, select: { id: true, client: { select: { archivedAt: true } } } });
    if (!site) throw new NotFoundError();
    if (!archived && site.client.archivedAt) throw new FieldError("clientId", "restoreClientFirst");
    await tx.site.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: archived ? "site.archived" : "site.restored",
      entityType: "Site",
      entityId: id,
    });
  });
}
