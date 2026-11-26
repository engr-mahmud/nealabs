import { beforeEach, describe, expect, it } from "vitest";
import { prisma, tenantDb } from "@/lib/db";
import { normalizeSaudiMobile } from "@/lib/phone";
import { registerUser } from "@/features/auth/service";
import { CODE_TTL_MS, RESEND_COOLDOWN_MS, createPhoneCode, setPendingPhone, verifyPhoneCode } from "@/features/auth/phone-verification";
import { signUpSchema } from "@/features/auth/schemas";
import { loadOrgContext } from "@/features/organizations/context";
import { createOrganization } from "@/features/organizations/service";
import { resetDb } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;
let n = 0;
async function newUser(phone = "+966512345678") {
  n += 1;
  return registerUser({ name: "Test", email: `t${n}-${Date.now()}@example.com`, phone, password: "password123", locale: "en" });
}
async function verifiedUser(phone: string) {
  const user = await newUser(phone);
  const { code } = await createPhoneCode(user.id);
  await verifyPhoneCode(user.id, code);
  return user;
}

describe("Saudi mobile numbers", () => {
  it("normalizes common formats to E.164", () => {
    for (const raw of ["0512345678", "512345678", "+966512345678", "966 51 234 5678", "00966512345678", "٠٥١٢٣٤٥٦٧٨"]) {
      expect(normalizeSaudiMobile(raw)).toBe("+966512345678");
    }
  });
  it("rejects landlines, short numbers and other countries", () => {
    for (const raw of ["0138123456", "05123456", "+971501234567", "abc", ""]) expect(normalizeSaudiMobile(raw)).toBeNull();
  });
  it("sign-up requires a valid mobile", () => {
    const base = { name: "Ali", email: "a@example.com", password: "password123" };
    expect(signUpSchema.safeParse({ ...base, phone: "123" }).success).toBe(false);
    expect(signUpSchema.parse({ ...base, phone: "0512345678" }).phone).toBe("+966512345678");
  });
});

describe("phone verification", () => {
  beforeEach(resetDb);

  it("a correct 6-digit code verifies the number", async () => {
    const user = await newUser();
    const { code } = await createPhoneCode(user.id);
    expect(code).toMatch(/^\d{6}$/);
    await verifyPhoneCode(user.id, code);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.phone).toBe("+966512345678");
    expect(stored.phoneVerifiedAt).not.toBeNull();
    expect(stored.pendingPhone).toBeNull();
  });

  it("stores only a hash of the code", async () => {
    const user = await newUser();
    const { code } = await createPhoneCode(user.id);
    const row = await prisma.phoneVerificationCode.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.codeHash).not.toContain(code);
  });

  it("wrong codes are rejected and lock after 5 tries", async () => {
    const user = await newUser();
    const { code } = await createPhoneCode(user.id);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await expect(verifyPhoneCode(user.id, wrong)).rejects.toMatchObject({ code: "codeInvalid" });
    await expect(verifyPhoneCode(user.id, wrong)).rejects.toMatchObject({ code: "codeTooManyAttempts" });
    // Even the right code no longer works: a new code is needed.
    await expect(verifyPhoneCode(user.id, code)).rejects.toMatchObject({ code: "codeTooManyAttempts" });
  });

  it("codes expire after 10 minutes", async () => {
    const user = await newUser();
    const now = new Date();
    const { code } = await createPhoneCode(user.id, now);
    await expect(verifyPhoneCode(user.id, code, new Date(now.getTime() + CODE_TTL_MS + 1))).rejects.toMatchObject({ code: "codeExpired" });
  });

  it("has a resend cooldown, and a new code replaces the old one", async () => {
    const user = await newUser();
    const now = new Date();
    const first = await createPhoneCode(user.id, now);
    await expect(createPhoneCode(user.id, new Date(now.getTime() + 1000))).rejects.toMatchObject({ code: "codeCooldown" });
    const second = await createPhoneCode(user.id, new Date(now.getTime() + RESEND_COOLDOWN_MS));
    if (first.code !== second.code) {
      await expect(verifyPhoneCode(user.id, first.code, new Date(now.getTime() + RESEND_COOLDOWN_MS))).rejects.toMatchObject({ code: "codeInvalid" });
    }
    await verifyPhoneCode(user.id, second.code, new Date(now.getTime() + RESEND_COOLDOWN_MS));
  });

  it("a number verified by one account cannot be used by another", async () => {
    await verifiedUser("+966512345678");
    await expect(newUser("+966512345678")).rejects.toMatchObject({ code: "phoneTaken" });
  });

  it("an unverified sign-up cannot block the real owner of the number", async () => {
    const squatter = await newUser("+966512345678");
    const owner = await verifiedUser("+966512345678");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).phone).toBe("+966512345678");
    // The squatter can no longer get a code for that number.
    await expect(createPhoneCode(squatter.id)).rejects.toMatchObject({ code: "phoneTaken" });
  });

  it("the number can be changed before verification", async () => {
    const user = await newUser("+966512345678");
    await setPendingPhone(user.id, "0598765432");
    const { phone, code } = await createPhoneCode(user.id);
    expect(phone).toBe("+966598765432");
    await verifyPhoneCode(user.id, code);
    await expect(setPendingPhone(user.id, "0511111111")).rejects.toMatchObject({ code: "phoneAlreadyVerified" });
  });
});

describe("one free trial per new email and phone", () => {
  beforeEach(resetDb);

  it("an unverified account cannot create a company", async () => {
    const user = await newUser();
    await expect(createOrganization(user.id, { nameEn: "Acme", nameAr: null })).rejects.toMatchObject({ code: "phoneNotVerified" });
  });

  it("a new verified account gets 7 days; its next companies share the same trial", async () => {
    const user = await verifiedUser("+966512345678");
    const start = new Date();
    const first = await createOrganization(user.id, { nameEn: "First", nameAr: null }, start);
    const second = await createOrganization(user.id, { nameEn: "Second", nameAr: null }, new Date(start.getTime() + 3 * DAY));
    const subA = await tenantDb(first.id).subscription.findFirstOrThrow();
    const subB = await tenantDb(second.id).subscription.findFirstOrThrow();
    expect(subA.trialEndsAt.getTime() - start.getTime()).toBe(7 * DAY);
    expect(subB.trialEndsAt.getTime()).toBe(subA.trialEndsAt.getTime());
  });

  it("a company created after the account's trial ended starts read-only", async () => {
    const user = await verifiedUser("+966512345678");
    await createOrganization(user.id, { nameEn: "First", nameAr: null }, new Date(Date.now() - 10 * DAY));
    const late = await createOrganization(user.id, { nameEn: "Late", nameAr: null });
    expect((await loadOrgContext(user.id, late.id))?.access.readOnly).toBe(true);
  });

  it("a phone or email that already had a trial gets no new one", async () => {
    const user = await verifiedUser("+966512345678");
    await createOrganization(user.id, { nameEn: "First", nameAr: null });
    // Simulate the same number coming back on a new account (e.g. after the old account was removed).
    await prisma.user.update({ where: { id: user.id }, data: { phone: null } });
    const again = await verifiedUser("+966512345678");
    const org = await createOrganization(again.id, { nameEn: "Again", nameAr: null });
    expect((await loadOrgContext(again.id, org.id))?.access.readOnly).toBe(true);
    expect(await prisma.trialClaim.count()).toBe(1);
  });
});
