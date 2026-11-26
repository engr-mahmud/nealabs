import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { authenticate, createPasswordResetToken, registerUser, resetPassword } from "@/features/auth/service";
import { createSessionRecord, findValidSession } from "@/features/auth/session-store";
import { resetDb } from "./helpers";

describe("auth", () => {
  beforeEach(resetDb);

  it("registers a user with a hashed password and rejects duplicate emails", async () => {
    const user = await registerUser({ name: "Mahmud", email: "owner@example.com", password: "secret-pass", locale: "en", phone: "+966500000001" });
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    await expect(registerUser({ name: "X", email: "owner@example.com", password: "another-pass", locale: "en", phone: "+966500000002" })).rejects.toMatchObject({ code: "emailTaken" });
  });

  it("authenticates only with the right password", async () => {
    await registerUser({ name: "Mahmud", email: "owner@example.com", password: "secret-pass", locale: "en", phone: "+966500000003" });
    expect(await authenticate("owner@example.com", "secret-pass")).not.toBeNull();
    expect(await authenticate("owner@example.com", "wrong-pass")).toBeNull();
    expect(await authenticate("nobody@example.com", "secret-pass")).toBeNull();
  });

  it("stores only a hash of the session token", async () => {
    const user = await registerUser({ name: "A", email: "a@example.com", password: "secret-pass", locale: "en", phone: "+966500000004" });
    const { token } = await createSessionRecord(user.id);
    const row = await prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).not.toBe(token);
    expect((await findValidSession(token))?.userId).toBe(user.id);
    expect(await findValidSession("not-a-real-token")).toBeNull();
  });

  it("password reset works once and signs out all sessions", async () => {
    const user = await registerUser({ name: "A", email: "a@example.com", password: "old-password", locale: "en", phone: "+966500000005" });
    await createSessionRecord(user.id);
    const result = await createPasswordResetToken("a@example.com");
    expect(result).not.toBeNull();
    expect(await createPasswordResetToken("missing@example.com")).toBeNull();

    await resetPassword(result!.token, "new-password");
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await authenticate("a@example.com", "new-password")).not.toBeNull();
    expect(await authenticate("a@example.com", "old-password")).toBeNull();
    await expect(resetPassword(result!.token, "third-password")).rejects.toMatchObject({ code: "resetTokenInvalid" });
  });

  it("a new reset link cancels the previous one", async () => {
    await registerUser({ name: "A", email: "a@example.com", password: "old-password", locale: "en", phone: "+966500000006" });
    const first = await createPasswordResetToken("a@example.com");
    await createPasswordResetToken("a@example.com");
    await expect(resetPassword(first!.token, "new-password")).rejects.toMatchObject({ code: "resetTokenInvalid" });
  });

  it("rate limits after the allowed number of attempts", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("login:email:test", 5, 900);
    await expect(rateLimit("login:email:test", 5, 900)).rejects.toBeInstanceOf(RateLimitError);
  });
});
