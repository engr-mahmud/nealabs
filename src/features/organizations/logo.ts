import { LOGO_MAX_BYTES, LOGO_TYPES } from "./schemas";

type LogoType = (typeof LOGO_TYPES)[number];

/**
 * Detects the real image type from magic bytes instead of trusting the
 * browser-supplied type. SVG is rejected on purpose (it can carry scripts).
 */
export function detectImageType(bytes: Uint8Array): LogoType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

export type LogoCheck = { ok: true; mimeType: LogoType } | { ok: false; error: "logoTooLarge" | "logoInvalidType" | "required" };

export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, error: "required" };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, error: "logoTooLarge" };
  const mimeType = detectImageType(bytes);
  if (!mimeType) return { ok: false, error: "logoInvalidType" };
  return { ok: true, mimeType };
}
