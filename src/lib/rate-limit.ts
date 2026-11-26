import { prisma } from "@/lib/db";
import { RateLimitError } from "@/lib/errors";

/**
 * Fixed-window rate limit stored in PostgreSQL, so it works across serverless
 * instances and on a single VPS without Redis. One atomic upsert per check.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, "windowStart") VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."windowStart" < now() - make_interval(secs => ${windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      "windowStart" = CASE WHEN rate_limits."windowStart" < now() - make_interval(secs => ${windowSeconds})
                   THEN now() ELSE rate_limits."windowStart" END
    RETURNING count`;
  const count = rows[0]?.count ?? 0;
  if (count > limit) throw new RateLimitError();
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}
