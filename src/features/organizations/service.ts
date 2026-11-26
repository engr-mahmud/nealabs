import type { Role } from "@/generated/prisma/enums";
import { prisma, setTenant, systemDb, tenantDb, tenantTransaction } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { env } from "@/lib/env";
import { writeAudit } from "@/features/audit/log";
import { trialEndDate } from "@/features/billing/access";
import { assertCan, type OrgContext } from "./context";
import { checkLogo } from "./logo";
import type { CompanyNameInput, OrganizationUpdate } from "./schemas";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates an organization owned by the user. The free trial belongs to the
 * account: it starts with the first company, and later companies share the same
 * end date. A phone number or email that already had a trial gets none.
 */
export async function createOrganization(userId: string, input: CompanyNameInput, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, phone: true, phoneVerifiedAt: true, trialEndsAt: true },
    });
    if (!user.phone || !user.phoneVerifiedAt) throw new AppError("phoneNotVerified");

    let trialEndsAt = user.trialEndsAt;
    if (!trialEndsAt) {
      const claimed = await tx.trialClaim.findFirst({ where: { OR: [{ phone: user.phone }, { email: user.email }] } });
      if (claimed) {
        trialEndsAt = now; // no new trial: starts read-only with a prompt to subscribe
      } else {
        await tx.trialClaim.create({ data: { phone: user.phone, email: user.email, userId } });
        trialEndsAt = trialEndDate(now, env().TRIAL_DAYS);
      }
      await tx.user.update({ where: { id: userId }, data: { trialEndsAt } });
    }

    const org = await tx.organization.create({
      data: { nameEn: input.nameEn, nameAr: input.nameAr ?? null, createdById: userId },
    });
    await tx.membership.create({ data: { userId, organizationId: org.id, role: "OWNER" } });
    await setTenant(tx, org.id);
    await tx.subscription.create({ data: { organizationId: org.id, status: "TRIALING", trialEndsAt } });
    await writeAudit(tx, { organizationId: org.id, userId, action: "organization.created", entityType: "Organization", entityId: org.id });
    return org;
  });
}

export async function updateOrganization(ctx: OrgContext, data: OrganizationUpdate) {
  assertCan(ctx, "org.update");
  return tenantTransaction(ctx.organizationId, async (tx) => {
    const org = await tx.organization.update({ where: { id: ctx.organizationId }, data });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "organization.updated",
      entityType: "Organization",
      entityId: ctx.organizationId,
      metadata: { fields: Object.keys(data) },
    });
    return org;
  });
}

export async function completeSetup(ctx: OrgContext) {
  assertCan(ctx, "org.update");
  await prisma.organization.updateMany({
    where: { id: ctx.organizationId, setupCompletedAt: null },
    data: { setupCompletedAt: new Date() },
  });
}

export async function setOrganizationLogo(ctx: OrgContext, bytes: Uint8Array) {
  assertCan(ctx, "org.update");
  const check = checkLogo(bytes);
  if (!check.ok) throw new AppError(check.error);
  const data = new Uint8Array(bytes);
  await tenantTransaction(ctx.organizationId, async (tx) => {
    await tx.organizationLogo.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, data, mimeType: check.mimeType },
      update: { data, mimeType: check.mimeType },
    });
    await writeAudit(tx, { organizationId: ctx.organizationId, userId: ctx.userId, action: "organization.logo_updated", entityType: "Organization", entityId: ctx.organizationId });
  });
}

export async function removeOrganizationLogo(ctx: OrgContext) {
  assertCan(ctx, "org.update");
  await prisma.organizationLogo.deleteMany({ where: { organizationId: ctx.organizationId } });
}

export async function getOrganizationLogo(organizationId: string) {
  return prisma.organizationLogo.findUnique({ where: { organizationId } });
}

export async function getOrganization(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return prisma.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    include: { logo: { select: { updatedAt: true } } },
  });
}

/** All organizations the user belongs to, for the organization switcher. */
export async function listUserOrganizations(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, organization: { archivedAt: null } },
    select: { role: true, organization: { select: { id: true, nameEn: true, nameAr: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({ ...m.organization, role: m.role }));
}

export async function listMembers(ctx: OrgContext) {
  assertCan(ctx, "data.read");
  return prisma.membership.findMany({
    where: { organizationId: ctx.organizationId },
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function listPendingInvitations(ctx: OrgContext) {
  assertCan(ctx, "members.manage");
  return tenantDb(ctx.organizationId).invitation.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, expiresAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createInvitation(ctx: OrgContext, input: { email: string; role: Role }) {
  assertCan(ctx, "members.manage");
  const alreadyMember = await prisma.membership.findFirst({
    where: { organizationId: ctx.organizationId, user: { email: input.email } },
    select: { id: true },
  });
  if (alreadyMember) throw new AppError("alreadyMember");

  const token = generateToken();
  await tenantTransaction(ctx.organizationId, async (tx) => {
    // Replace any earlier pending invitation for the same email.
    await tx.invitation.updateMany({
      where: { email: input.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invitation = await tx.invitation.create({
      data: {
        organizationId: ctx.organizationId,
        email: input.email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "member.invited",
      entityType: "Invitation",
      entityId: invitation.id,
      metadata: { role: input.role },
    });
  });
  return token;
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string) {
  assertCan(ctx, "members.manage");
  // RLS limits this to the current organization even if the id belongs to another one.
  const { count } = await tenantDb(ctx.organizationId).invitation.updateMany({
    where: { id: invitationId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw new NotFoundError();
}

/** Looks up an invitation from an email link. Bypasses RLS: the token is the authorization. */
export async function findInvitationByToken(token: string) {
  const invitation = await systemDb().invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { id: true, nameEn: true, nameAr: true, archivedAt: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) return null;
  if (invitation.organization.archivedAt) return null;
  return invitation;
}

export async function acceptInvitation(user: { id: string; email: string }, token: string) {
  const invitation = await findInvitationByToken(token);
  if (!invitation) throw new NotFoundError();
  // The invitation is bound to an email address so a forwarded link cannot be used by someone else.
  if (invitation.email !== user.email.toLowerCase()) throw new AppError("invitationEmailMismatch");

  await tenantTransaction(invitation.organizationId, async (tx) => {
    await tx.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
      create: { userId: user.id, organizationId: invitation.organizationId, role: invitation.role },
      update: {},
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await writeAudit(tx, {
      organizationId: invitation.organizationId,
      userId: user.id,
      action: "member.joined",
      entityType: "Membership",
      metadata: { role: invitation.role },
    });
  });
  return invitation.organizationId;
}

export async function removeMember(ctx: OrgContext, membershipId: string) {
  assertCan(ctx, "members.manage");
  await tenantTransaction(ctx.organizationId, async (tx) => {
    const member = await tx.membership.findFirst({ where: { id: membershipId, organizationId: ctx.organizationId } });
    if (!member) throw new NotFoundError();
    if (member.userId === ctx.userId) throw new ForbiddenError();
    if (member.role === "OWNER") {
      const owners = await tx.membership.count({ where: { organizationId: ctx.organizationId, role: "OWNER" } });
      if (owners <= 1) throw new AppError("lastOwner");
    }
    await tx.membership.delete({ where: { id: member.id } });
    await tx.session.updateMany({ where: { userId: member.userId, activeOrganizationId: ctx.organizationId }, data: { activeOrganizationId: null } });
    await writeAudit(tx, {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "member.removed",
      entityType: "Membership",
      entityId: member.id,
      metadata: { role: member.role },
    });
  });
}

/** Full data export. Always allowed, including when the organization is read-only. */
export async function exportOrganizationData(ctx: OrgContext) {
  assertCan(ctx, "data.export");
  const db = tenantDb(ctx.organizationId);
  const [organization, members, subscription, auditLogs] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId } }),
    listMembers(ctx),
    db.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
    ctx.role === "OWNER" ? db.auditLog.findMany({ orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
  ]);
  return { exportedAt: new Date().toISOString(), organization, members, subscription, auditLogs };
}
