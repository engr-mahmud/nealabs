import { prisma } from "@/lib/db";
import { hashPassword } from "@/features/auth/password";
import { loadOrgContext, type OrgContext } from "@/features/organizations/context";
import { createOrganization } from "@/features/organizations/service";

if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error("Refusing to run tests against a non-test database. Check .env.test.");
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, subscriptions, invitations, organization_logos, memberships, organizations, password_reset_tokens, sessions, users, rate_limits CASCADE',
  );
}

let counter = 0;
export async function createUser(name = "User", password = "password123") {
  counter += 1;
  return prisma.user.create({
    data: { name, email: `user${counter}-${Date.now()}@example.com`, passwordHash: await hashPassword(password) },
  });
}

/** Creates an owner with an organization and returns the owner's context. */
export async function createOwnerWithOrg(name: string, now = new Date()) {
  const user = await createUser(`${name} Owner`);
  const org = await createOrganization(user.id, { nameEn: name, nameAr: null }, now);
  const ctx = (await loadOrgContext(user.id, org.id)) as OrgContext;
  return { user, org, ctx };
}

export async function addMember(organizationId: string, role: "OWNER" | "ACCOUNTANT") {
  const user = await createUser(role === "OWNER" ? "Co-owner" : "Accountant");
  const membership = await prisma.membership.create({ data: { userId: user.id, organizationId, role } });
  const ctx = (await loadOrgContext(user.id, organizationId)) as OrgContext;
  return { user, membership, ctx };
}
