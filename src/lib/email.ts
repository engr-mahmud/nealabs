import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = env();
  if (config.EMAIL_TRANSPORT === "console") {
    if (config.NODE_ENV === "production") {
      console.warn("[email] EMAIL_TRANSPORT=console in production; email not delivered");
    }
    // Development only: prints the email (including links) to the server log.
    console.info(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }
  transporter ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } : undefined,
  });
  await transporter.sendMail({ from: config.EMAIL_FROM, ...message });
}

/** Minimal, safe HTML wrapper. Every dynamic value must be escaped. */
export function emailLayout(opts: { dir: "ltr" | "rtl"; heading: string; body: string; lines?: string[]; cta?: { label: string; url: string }; footer: string }) {
  const list = opts.lines?.length ? `<ul style="padding-inline-start:20px">${opts.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>` : "";
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html dir="${opts.dir}"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px">${escapeHtml(opts.heading)}</h1><p>${escapeHtml(opts.body)}</p>${list}${cta}
<p style="color:#64748b;font-size:13px">${escapeHtml(opts.footer)}</p></body></html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
