import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { sendExpiryReminders } from "@/features/workforce/reminders";

/**
 * Daily Iqama/passport expiry reminders. Call once a day with
 * "Authorization: Bearer <CRON_SECRET>" (Vercel Cron sends this header itself).
 */
export async function GET(req: Request) {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response(null, { status: 401 });
  }
  const result = await sendExpiryReminders();
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
