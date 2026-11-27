import "server-only";
import type { Browser } from "playwright-core";
import { env } from "@/lib/env";

/**
 * HTML → PDF with headless Chromium, which shapes Arabic text correctly. One browser
 * is shared and each PDF gets its own isolated context. JavaScript and network are
 * off: the HTML is self-contained (fonts, logo and QR are embedded).
 */
let browserPromise: Promise<Browser> | null = null;

function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = env().PDF_CHROMIUM_PATH || undefined;
    browserPromise = import("playwright-core").then(({ chromium }) => chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"] })).then((b) => {
      b.on("disconnected", () => {
        browserPromise = null;
      });
      return b;
    });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export class PdfUnavailableError extends Error {}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  let browser: Browser;
  try {
    browser = await getBrowser();
  } catch (e) {
    console.error("[pdf] could not start Chromium. Set PDF_CHROMIUM_PATH or run: npx playwright-core install chromium", e instanceof Error ? e.message : e);
    throw new PdfUnavailableError();
  }
  const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready).catch(() => undefined);
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}
