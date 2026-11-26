import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Base client. Use it only for tables without tenant data (users, sessions,
 * organizations, memberships). Tenant tables go through tenantDb()/systemDb().
 */
export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function withSetting(name: "app.org_id" | "app.bypass_rls", value: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config(${name}, ${value}, true)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}

/**
 * Client scoped to one organization. PostgreSQL RLS only returns and accepts
 * rows of this organization, even if a query forgets its where clause.
 * organizationId must come from the server session, never from the client.
 */
export function tenantDb(organizationId: string) {
  if (!organizationId) throw new Error("tenantDb requires an organizationId");
  return withSetting("app.org_id", organizationId);
}

/** Bypasses RLS. Only for system flows (invitation lookup, webhooks, jobs). */
export function systemDb() {
  return withSetting("app.bypass_rls", "on");
}

export type TenantDb = ReturnType<typeof tenantDb>;

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type { TxClient };

/** Sets the tenant for the rest of an interactive transaction. */
export async function setTenant(tx: TxClient, organizationId: string) {
  await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
}

/** Interactive transaction scoped to one organization (RLS applies). */
export function tenantTransaction<T>(organizationId: string, fn: (tx: TxClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await setTenant(tx, organizationId);
    return fn(tx);
  });
}
