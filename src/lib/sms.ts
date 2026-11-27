import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * SMS sending behind one function, chosen by SMS_TRANSPORT:
 * - "console": prints the message to the server log (development only)
 * - "demo": sends nothing; the verify page shows the code (public demo only, see phone-sms.ts)
 * - "unifonic": Unifonic REST API (Saudi provider)
 * - "twilio": Twilio Messages API
 * Saudi rules require a registered sender name for SMS; set it up with the provider.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const config = env();
  switch (config.SMS_TRANSPORT) {
    case "console":
      if (config.NODE_ENV === "production") console.warn("[sms] SMS_TRANSPORT=console in production; SMS not delivered");
      console.info(`[sms] to=${to} body="${body}"`);
      return;
    case "demo":
      return;
    case "unifonic":
      return sendUnifonic(to, body);
    case "twilio":
      return sendTwilio(to, body);
  }
}

async function sendUnifonic(to: string, body: string) {
  const { UNIFONIC_APP_SID, UNIFONIC_SENDER_ID } = env();
  if (!UNIFONIC_APP_SID || !UNIFONIC_SENDER_ID) throw new Error("Unifonic is not configured");
  const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ AppSid: UNIFONIC_APP_SID, SenderID: UNIFONIC_SENDER_ID, Recipient: to.replace(/^\+/, ""), Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean | string; errorCode?: string } | null;
  if (!res.ok || !json || String(json.success) !== "true") {
    console.error("[sms] unifonic failed", res.status, json?.errorCode);
    throw new AppError("smsFailed");
  }
}

async function sendTwilio(to: string, body: string) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM } = env();
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) throw new Error("Twilio is not configured");
  const params = new URLSearchParams({ To: to, Body: body });
  params.set(TWILIO_FROM.startsWith("MG") ? "MessagingServiceSid" : "From", TWILIO_FROM);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[sms] twilio failed", res.status);
    throw new AppError("smsFailed");
  }
}
