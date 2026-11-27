import { prisma } from "@/lib/db";
import { hashPassword } from "@/features/auth/password";
import { loadOrgContext, type OrgContext } from "@/features/organizations/context";
import { createOrganization } from "@/features/organizations/service";
import { createClient } from "@/features/clients/service";
import { createSite } from "@/features/sites/service";
import type { ClientInput } from "@/features/clients/schemas";
import type { WorkerCreateInput } from "@/features/workforce/schemas";

if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error("Refusing to run tests against a non-test database. Check .env.test.");
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE workers, sites, clients, trial_claims, phone_verification_codes, audit_logs, subscriptions, invitations, organization_logos, memberships, organizations, password_reset_tokens, sessions, users, rate_limits CASCADE',
  );
}

let counter = 0;
let phoneCounter = 0;
/** A unique, valid Saudi mobile in E.164 for each call. */
export function uniquePhone() {
  phoneCounter += 1;
  return `+9665${String(Date.now() % 1_000_000).padStart(6, "0").slice(0, 4)}${String(phoneCounter).padStart(4, "0")}`;
}

export async function createUser(name = "User", password = "password123") {
  counter += 1;
  return prisma.user.create({
    data: {
      name,
      email: `user${counter}-${Date.now()}@example.com`,
      phone: uniquePhone(),
      phoneVerifiedAt: new Date(),
      passwordHash: await hashPassword(password),
    },
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

export function clientInput(nameEn: string, extra: Partial<ClientInput> = {}): ClientInput {
  return { nameEn, nameAr: null, vatNumber: null, crNumber: null, contactName: null, phone: null, email: null, addressLine: null, city: null, postalCode: null, notes: null, ...extra };
}

export function workerInput(name: string, iqamaNumber: string, extra: Partial<WorkerCreateInput> = {}): WorkerCreateInput {
  return {
    name,
    nameAr: null,
    iqamaNumber,
    nationality: "Bangladesh",
    jobTitle: "Helper",
    phone: null,
    basicSalary: 150000,
    housingAllowance: 30000,
    transportAllowance: 0,
    otherAllowance: 0,
    iqamaExpiry: null,
    passportNumber: null,
    passportExpiry: null,
    siteId: null,
    ...extra,
  };
}


export async function orgWithSite(name: string) {
  const owner = await createOwnerWithOrg(name);
  const client = await createClient(owner.ctx, clientInput(`${name} Client`));
  const site = await createSite(owner.ctx, { clientId: client.id, name: "Main Site", city: null, address: null, notes: null });
  return { ...owner, client, site };
}
