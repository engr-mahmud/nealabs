import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  EMAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("NeaLabs <no-reply@example.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMS_TRANSPORT: z.enum(["console", "unifonic", "twilio"]).default("console"),
  UNIFONIC_APP_SID: z.string().optional(),
  UNIFONIC_SENDER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),
  /** 32 random bytes, base64. Encrypts Iqama and passport numbers. Keep it secret and backed up. */
  FIELD_ENCRYPTION_KEY: z.string().optional(),
  /** Shared secret for scheduled jobs (Authorization: Bearer <CRON_SECRET>). */
  CRON_SECRET: z.string().min(16).optional(),
  /** Chromium/Chrome binary for invoice PDFs. Empty: Playwright's own Chromium (npx playwright-core install chromium). */
  PDF_CHROMIUM_PATH: z.string().optional(),
  /** "test": built-in test checkout, no money moves (demo). "moyasar": real payments (mada, cards, Apple Pay). */
  PAYMENT_GATEWAY: z.enum(["test", "moyasar"]).default("test"),
  /** Moyasar secret API key (sk_test_... in sandbox, sk_live_... in production). Server only. */
  MOYASAR_SECRET_KEY: z.string().optional(),
  /** The "Secret Token" set on the webhook in the Moyasar dashboard. */
  MOYASAR_WEBHOOK_SECRET: z.string().optional(),
  MOYASAR_API_URL: z.url().default("https://api.moyasar.com/v1"),
  TRIAL_DAYS: z.coerce.number().int().min(1).max(60).default(7),
});

let cached: z.infer<typeof schema> | undefined;

export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
