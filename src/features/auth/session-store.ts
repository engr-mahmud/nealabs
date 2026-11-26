import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSessionRecord(userId: string, activeOrganizationId?: string | null) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, activeOrganizationId: activeOrganizationId ?? null, expiresAt },
  });
  return { token, expiresAt };
}

export async function findValidSession(token: string) {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, locale: true, phoneVerifiedAt: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return session;
}

export async function deleteSessionByToken(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function deleteAllSessionsForUser(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
