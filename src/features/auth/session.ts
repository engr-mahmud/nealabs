import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionRecord, deleteSessionByToken, findValidSession } from "./session-store";

export const SESSION_COOKIE = "nl_session";

/** Creates a DB session and sets the httpOnly cookie. Server actions only. */
export async function startSession(userId: string, activeOrganizationId?: string | null) {
  const { token, expiresAt } = await createSessionRecord(userId, activeOrganizationId);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token);
  store.delete(SESSION_COOKIE);
}

/** Current session and user, or null. Cached per request. */
export const getSession = cache(async () => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findValidSession(token);
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

/** Signed in and phone verified; otherwise sends the user to the right step. */
export async function requireVerifiedSession(next?: string) {
  const session = await requireSession();
  if (!session.user.phoneVerifiedAt) redirect(next ? `/verify-phone?next=${encodeURIComponent(next)}` : "/verify-phone");
  return session;
}
