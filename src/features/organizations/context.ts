import type { Role } from "@/generated/prisma/enums";
import { prisma, tenantDb } from "@/lib/db";
import { ForbiddenError, ReadOnlyError } from "@/lib/errors";
import { computeAccess, type OrgAccess } from "@/features/billing/access";
import { can, isBlockedWhenReadOnly, type Permission } from "./permissions";

/** Who is acting, in which organization, with which role and access. */
export interface OrgContext {
  userId: string;
  organizationId: string;
  role: Role;
  access: OrgAccess;
}

/**
 * Loads the context for a user in an organization. Returns null when the user
 * is not a member, so callers can never act on an organization they do not
 * belong to. organizationId comes from the server session, never the client.
 */
export async function loadOrgContext(userId: string, organizationId: string, now = new Date()): Promise<OrgContext | null> {
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
    select: { role: true, organization: { select: { archivedAt: true } } },
  });
  if (!membership || membership.organization.archivedAt) return null;
  const subscription = await tenantDb(organizationId).subscription.findUnique({ where: { organizationId } });
  return { userId, organizationId, role: membership.role, access: computeAccess(subscription, now) };
}

/** Throws unless the role allows the action and the organization's access state permits it. */
export function assertCan(ctx: OrgContext, permission: Permission): void {
  if (!can(ctx.role, permission)) throw new ForbiddenError();
  if (ctx.access.readOnly && isBlockedWhenReadOnly(permission)) throw new ReadOnlyError();
}
