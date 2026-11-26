/** Startup safety check: RLS is bypassed for superusers, so warn loudly if the app connects as one. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { prisma } = await import("@/lib/db");
    const rows = await prisma.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    if (rows[0]?.rolsuper || rows[0]?.rolbypassrls) {
      console.error("[security] DATABASE_URL uses a superuser or BYPASSRLS role. Row Level Security is NOT enforced. Use a normal role (see README).");
    }
  } catch (e) {
    console.error("[startup] database check failed", e instanceof Error ? e.message : e);
  }
}
