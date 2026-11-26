import { beforeEach, describe, expect, it } from "vitest";
import { prisma, systemDb, tenantDb } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { loadOrgContext } from "@/features/organizations/context";
import {
  acceptInvitation,
  createInvitation,
  exportOrganizationData,
  listMembers,
  removeMember,
  revokeInvitation,
  updateOrganization,
} from "@/features/organizations/service";
import { addMember, createOwnerWithOrg, createUser, resetDb } from "./helpers";

describe("tenant isolation", () => {
  beforeEach(resetDb);

  it("RLS only returns rows of the current organization", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");

    const subsA = await tenantDb(a.org.id).subscription.findMany();
    expect(subsA.map((s) => s.organizationId)).toEqual([a.org.id]);

    const logsA = await tenantDb(a.org.id).auditLog.findMany();
    expect(logsA.length).toBeGreaterThan(0);
    expect(logsA.every((l) => l.organizationId === a.org.id)).toBe(true);

    // Even a direct lookup by the other tenant's id returns nothing.
    const leaked = await tenantDb(a.org.id).subscription.findUnique({ where: { organizationId: b.org.id } });
    expect(leaked).toBeNull();
  });

  it("fails closed when no tenant is set", async () => {
    await createOwnerWithOrg("Alpha");
    expect(await prisma.auditLog.count()).toBe(0);
    expect(await prisma.subscription.count()).toBe(0);
    expect(await systemDb().subscription.count()).toBe(1);
  });

  it("RLS rejects writing a row into another organization", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");
    await expect(
      tenantDb(a.org.id).auditLog.create({ data: { organizationId: b.org.id, action: "x", entityType: "Test" } }),
    ).rejects.toThrow();
  });

  it("RLS blocks updates and deletes across organizations", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");
    const updated = await tenantDb(a.org.id).subscription.updateMany({ where: { organizationId: b.org.id }, data: { status: "EXPIRED" } });
    expect(updated.count).toBe(0);
    const deleted = await tenantDb(a.org.id).auditLog.deleteMany({ where: { organizationId: b.org.id } });
    expect(deleted.count).toBe(0);
    expect((await tenantDb(b.org.id).subscription.findFirstOrThrow()).status).toBe("TRIALING");
  });

  it("a user cannot load the context of an organization they do not belong to", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");
    expect(await loadOrgContext(a.user.id, b.org.id)).toBeNull();
  });

  it("services only touch the organization from the context", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");
    await updateOrganization(a.ctx, { nameEn: "Alpha Renamed" });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: b.org.id } })).nameEn).toBe("Beta");

    const membersA = await listMembers(a.ctx);
    expect(membersA.map((m) => m.user.id)).toEqual([a.user.id]);

    const exported = await exportOrganizationData(a.ctx);
    expect(exported.organization.id).toBe(a.org.id);
    expect(exported.auditLogs.every((l) => l.organizationId === a.org.id)).toBe(true);
  });

  it("cannot revoke another organization's invitation or remove its members", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const b = await createOwnerWithOrg("Beta");
    await createInvitation(b.ctx, { email: "someone@example.com", role: "ACCOUNTANT" });
    const invB = await tenantDb(b.org.id).invitation.findFirstOrThrow();
    const memberB = await addMember(b.org.id, "ACCOUNTANT");

    await expect(revokeInvitation(a.ctx, invB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(removeMember(a.ctx, memberB.membership.id)).rejects.toBeInstanceOf(NotFoundError);

    expect((await tenantDb(b.org.id).invitation.findUniqueOrThrow({ where: { id: invB.id } })).revokedAt).toBeNull();
    expect(await prisma.membership.count({ where: { organizationId: b.org.id } })).toBe(2);
  });

  it("accountants cannot change company settings or manage the team", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const accountant = await addMember(a.org.id, "ACCOUNTANT");
    await expect(updateOrganization(accountant.ctx, { nameEn: "Hacked" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createInvitation(accountant.ctx, { email: "x@example.com", role: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(removeMember(accountant.ctx, accountant.membership.id)).rejects.toBeInstanceOf(ForbiddenError);
    // Accountants can still read and export.
    expect((await exportOrganizationData(accountant.ctx)).organization.id).toBe(a.org.id);
  });

  it("an invitation only works for the invited email and only once", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const invited = await createUser("Invited");
    const stranger = await createUser("Stranger");
    const token = await createInvitation(a.ctx, { email: invited.email, role: "ACCOUNTANT" });

    await expect(acceptInvitation(stranger, token)).rejects.toMatchObject({ code: "invitationEmailMismatch" });
    expect(await acceptInvitation(invited, token)).toBe(a.org.id);
    const ctx = await loadOrgContext(invited.id, a.org.id);
    expect(ctx?.role).toBe("ACCOUNTANT");
    await expect(acceptInvitation(invited, token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("the last owner cannot be removed and owners cannot remove themselves", async () => {
    const a = await createOwnerWithOrg("Alpha");
    const ownerMembership = await prisma.membership.findFirstOrThrow({ where: { userId: a.user.id } });
    await expect(removeMember(a.ctx, ownerMembership.id)).rejects.toBeInstanceOf(ForbiddenError);
    const accountant = await addMember(a.org.id, "ACCOUNTANT");
    await removeMember(a.ctx, accountant.membership.id);
    expect(await loadOrgContext(accountant.user.id, a.org.id)).toBeNull();
  });
});
