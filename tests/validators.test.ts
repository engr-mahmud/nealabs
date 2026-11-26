import { describe, expect, it } from "vitest";
import { isValidCrNumber, isValidSaudiIban, isValidSaudiVat, toAsciiDigits } from "@/lib/validators";
import { checkLogo } from "@/features/organizations/logo";
import { organizationSchema } from "@/features/organizations/schemas";
import { safeNextPath } from "@/features/auth/schemas";

describe("validators", () => {
  it("Saudi VAT numbers are 15 digits starting and ending with 3", () => {
    expect(isValidSaudiVat("300000000000003")).toBe(true);
    expect(isValidSaudiVat("310000000000002")).toBe(false);
    expect(isValidSaudiVat("30000000000003")).toBe(false);
  });

  it("CR numbers are 10 digits", () => {
    expect(isValidCrNumber("1010000000")).toBe(true);
    expect(isValidCrNumber("101000000")).toBe(false);
  });

  it("checks the IBAN mod-97 checksum", () => {
    expect(isValidSaudiIban("SA03 8000 0000 6080 1016 7519")).toBe(true);
    expect(isValidSaudiIban("SA04 8000 0000 6080 1016 7519")).toBe(false);
    expect(isValidSaudiIban("GB82WEST12345698765432")).toBe(false);
  });

  it("accepts Arabic-Indic digits", () => {
    expect(toAsciiDigits("٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣")).toBe("300000000000003");
    const parsed = organizationSchema.parse({ nameEn: "Acme", vatNumber: "٣٠٠٠٠٠٠٠٠٠٠٠٠٠٣", iban: "sa03 8000 0000 6080 1016 7519" });
    expect(parsed.vatNumber).toBe("300000000000003");
    expect(parsed.iban).toBe("SA0380000000608010167519");
    expect(parsed.crNumber ?? null).toBeNull();
  });

  it("only allows same-site redirect paths", () => {
    expect(safeNextPath("/invite/abc")).toBe("/invite/abc");
    expect(safeNextPath("//evil.com")).toBeUndefined();
    expect(safeNextPath("https://evil.com")).toBeUndefined();
    expect(safeNextPath("/\\evil.com")).toBeUndefined();
  });
});

describe("logo upload checks", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  it("accepts real PNG bytes", () => {
    expect(checkLogo(png)).toEqual({ ok: true, mimeType: "image/png" });
  });
  it("rejects SVG and other content regardless of file name", () => {
    expect(checkLogo(new TextEncoder().encode("<svg onload=alert(1)>"))).toMatchObject({ ok: false, error: "logoInvalidType" });
  });
  it("rejects files over 512 KB", () => {
    const big = new Uint8Array(512 * 1024 + 1);
    big.set(png);
    expect(checkLogo(big)).toMatchObject({ ok: false, error: "logoTooLarge" });
  });
});
