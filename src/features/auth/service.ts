import { prisma } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { fakeVerify, hashPassword, verifyPassword } from "./password";
import { deleteAllSessionsForUser } from "./session-store";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export async function registerUser(input: { name: string; email: string; password: string; locale: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw new AppError("emailTaken");
  return prisma.user.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password), locale: input.locale },
    select: { id: true, email: true, name: true },
  });
}

/** Returns the user when the credentials match, otherwise null (same timing either way). */
export async function authenticate(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await fakeVerify(password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

/** Creates a single-use reset token. Returns null when no user has this email. */
export async function createPasswordResetToken(email: string) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, locale: true } });
  if (!user) return null;
  const token = generateToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    }),
  ]);
  return { token, user };
}

export async function isResetTokenValid(token: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!record && !record.usedAt && record.expiresAt > new Date();
}

/** Sets a new password and signs the user out everywhere. */
export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) throw new AppError("resetTokenInvalid");
  const passwordHash = await hashPassword(newPassword);
  // Mark used atomically so the same link cannot be used twice in parallel.
  const { count } = await prisma.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count === 0) throw new AppError("resetTokenInvalid");
  await prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
  await deleteAllSessionsForUser(record.userId);
  return record.userId;
}
