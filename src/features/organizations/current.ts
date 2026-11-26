import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { getSession, requireVerifiedSession } from "@/features/auth/session";
import { loadOrgContext, type OrgContext } from "./context";

/**
 * Resolves the active organization for the signed-in user. The organization
 * always comes from the server-side session and is re-checked against
 * membership on every request. Pages redirect; server actions throw.
 */
async function resolve(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<OrgContext | null> {
  if (session.activeOrganizationId) {
    const ctx = await loadOrgContext(session.userId, session.activeOrganizationId);
    if (ctx) return ctx;
  }
  // Fall back to the first organization the user belongs to.
  const first = await prisma.membership.findFirst({
    where: { userId: session.userId, organization: { archivedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  if (!first) return null;
  await prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId: first.organizationId } });
  return loadOrgContext(session.userId, first.organizationId);
}

const resolveCached = cache(async () => {
  const session = await getSession();
  if (!session) return { session: null, ctx: null };
  return { session, ctx: await resolve(session) };
});

/** For pages and layouts: redirects to sign-in or onboarding when needed. */
export async function requireOrgPage() {
  await requireVerifiedSession();
  const { session, ctx } = await resolveCached();
  if (!session) redirect("/sign-in");
  if (!ctx) redirect("/onboarding");
  return { session, user: session.user, ctx };
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireOrgAction(): Promise<OrgContext & { sessionId: string }> {
  const { session, ctx } = await resolveCached();
  if (!session) throw new UnauthorizedError();
  if (!session.user.phoneVerifiedAt) throw new AppError("phoneNotVerified");
  if (!ctx) throw new UnauthorizedError();
  return { ...ctx, sessionId: session.id };
}
