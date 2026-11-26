import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { normalizeSaudiMobile } from "@/lib/phone";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_ATTEMPTS = 5;

function hashCode(userId: string, code: string) {
  return createHash("sha256").update(`${userId}:${code}`).digest();
}

/** True when another account already verified this number. */
export async function isPhoneTaken(phone: string, exceptUserId?: string) {
  const owner = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  return !!owner && owner.id !== exceptUserId;
}

/** Sets the number to verify (sign-up or "change number"). Only before verification. */
export async function setPendingPhone(userId: string, raw: string) {
  const phone = normalizeSaudiMobile(raw);
  if (!phone) throw new AppError("invalidPhone");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phoneVerifiedAt: true } });
  if (user.phoneVerifiedAt) throw new AppError("phoneAlreadyVerified");
  if (await isPhoneTaken(phone, userId)) throw new AppError("phoneTaken");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { pendingPhone: phone } }),
    // Codes sent to the old number stop working.
    prisma.phoneVerificationCode.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  return phone;
}

/**
 * Creates a new 6-digit code for the user's pending number and returns it so
 * the caller can send it. Older codes stop working. Enforces a resend cooldown.
 */
export async function createPhoneCode(userId: string, now = new Date()) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pendingPhone: true, phoneVerifiedAt: true } });
  if (user.phoneVerifiedAt) throw new AppError("phoneAlreadyVerified");
  if (!user.pendingPhone) throw new AppError("invalidPhone");
  if (await isPhoneTaken(user.pendingPhone, userId)) throw new AppError("phoneTaken");

  const last = await prisma.phoneVerificationCode.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) throw new AppError("codeCooldown");

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.$transaction([
    prisma.phoneVerificationCode.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
    prisma.phoneVerificationCode.create({
      data: { userId, phone: user.pendingPhone, codeHash: hashCode(userId, code).toString("hex"), expiresAt: new Date(now.getTime() + CODE_TTL_MS), createdAt: now },
    }),
  ]);
  return { code, phone: user.pendingPhone };
}

/** The code the user can still enter, if any (for the verify page). */
export async function getActiveCode(userId: string, now = new Date()) {
  return prisma.phoneVerificationCode.findFirst({
    where: { userId, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "desc" },
    select: { phone: true, createdAt: true, expiresAt: true },
  });
}

/** Checks the code; on success the pending number becomes the account's verified number. */
export async function verifyPhoneCode(userId: string, rawCode: string, now = new Date()) {
  const code = rawCode.replace(/\D/g, "");
  const record = await prisma.phoneVerificationCode.findFirst({ where: { userId, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!record || record.expiresAt <= now) throw new AppError("codeExpired");
  if (record.attempts >= MAX_ATTEMPTS) throw new AppError("codeTooManyAttempts");

  // Count the attempt first so parallel guesses cannot exceed the limit.
  const { count } = await prisma.phoneVerificationCode.updateMany({
    where: { id: record.id, attempts: { lt: MAX_ATTEMPTS }, usedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (count === 0) throw new AppError("codeTooManyAttempts");

  const expected = Buffer.from(record.codeHash, "hex");
  if (code.length !== 6 || !timingSafeEqual(expected, hashCode(userId, code))) {
    throw new AppError(record.attempts + 1 >= MAX_ATTEMPTS ? "codeTooManyAttempts" : "codeInvalid");
  }

  try {
    await prisma.$transaction([
      prisma.phoneVerificationCode.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.user.update({ where: { id: userId }, data: { phone: record.phone, pendingPhone: null, phoneVerifiedAt: now } }),
    ]);
  } catch (e) {
    // Unique violation: someone verified this number first.
    if ((e as { code?: string }).code === "P2002") throw new AppError("phoneTaken");
    throw e;
  }
}
