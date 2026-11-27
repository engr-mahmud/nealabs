import { describe, expect, it } from "vitest";
import { blindIndex, decryptField, encryptField } from "@/lib/field-crypto";
import { halalasToInput, parseDateInput, parseSarToHalalas, toDateInput } from "@/lib/parse";
import { daysUntil, expiryStatus, todayInRiyadh } from "@/features/master-data/expiry";
import { isValidIqama, workerCreateSchema } from "@/features/workforce/schemas";
import { clientSchema } from "@/features/clients/schemas";
import { safeReturnPath } from "@/features/master-data/actions-helpers";

describe("money parsing (no floats)", () => {
  it("parses SAR amounts to integer halalas", () => {
    expect(parseSarToHalalas("1500")).toBe(150000);
    expect(parseSarToHalalas("1,500.5")).toBe(150050);
    expect(parseSarToHalalas("0.07")).toBe(7);
    expect(parseSarToHalalas("١٥٠٠٫٢٥")).toBe(150025);
    expect(parseSarToHalalas("1500.123")).toBeNull();
    expect(parseSarToHalalas("-5")).toBeNull();
    expect(parseSarToHalalas("abc")).toBeNull();
  });
  it("formats halalas back for inputs", () => {
    expect(halalasToInput(150000)).toBe("1500");
    expect(halalasToInput(150005)).toBe("1500.05");
  });
});

describe("date parsing", () => {
  it("accepts ISO and day-first formats and rejects impossible dates", () => {
    expect(toDateInput(parseDateInput("2027-03-15"))).toBe("2027-03-15");
    expect(toDateInput(parseDateInput("15/03/2027"))).toBe("2027-03-15");
    expect(toDateInput(parseDateInput("5.3.2027"))).toBe("2027-03-05");
    expect(parseDateInput("31/02/2027")).toBeNull();
    expect(parseDateInput("2027-13-01")).toBeNull();
    expect(parseDateInput("tomorrow")).toBeNull();
  });
});

describe("expiry", () => {
  it("uses the Saudi calendar day", () => {
    // 22:30 UTC on 1 Jan is already 2 Jan in Riyadh (UTC+3).
    expect(toDateInput(todayInRiyadh(new Date("2027-01-01T22:30:00Z")))).toBe("2027-01-02");
  });
  it("classifies expired, soon (30 days) and ok", () => {
    const today = new Date("2027-01-10T00:00:00Z");
    expect(expiryStatus(null, today)).toBe("none");
    expect(expiryStatus(new Date("2027-01-09T00:00:00Z"), today)).toBe("expired");
    expect(expiryStatus(new Date("2027-01-10T00:00:00Z"), today)).toBe("soon");
    expect(expiryStatus(new Date("2027-02-09T00:00:00Z"), today)).toBe("soon");
    expect(expiryStatus(new Date("2027-02-10T00:00:00Z"), today)).toBe("ok");
    expect(daysUntil(new Date("2027-01-17T00:00:00Z"), today)).toBe(7);
  });
});

describe("field encryption", () => {
  it("round-trips and uses a random IV", () => {
    const a = encryptField("2412345678");
    const b = encryptField("2412345678");
    expect(a).not.toBe(b);
    expect(a).not.toContain("2412345678");
    expect(decryptField(a)).toBe("2412345678");
  });
  it("detects tampering", () => {
    const [v, iv, tag, data] = encryptField("2412345678").split(":");
    const flipped = data!.slice(0, -2) + (data!.endsWith("A") ? "BB" : "AA");
    expect(() => decryptField([v, iv, tag, flipped].join(":"))).toThrow();
  });
  it("blind index is stable within a company and differs between companies", () => {
    expect(blindIndex("org1", "2412345678")).toBe(blindIndex("org1", "2412345678"));
    expect(blindIndex("org1", "2412345678")).not.toBe(blindIndex("org2", "2412345678"));
  });
});

describe("validation", () => {
  it("Iqama: 10 digits starting with 1 or 2", () => {
    expect(isValidIqama("2412345678")).toBe(true);
    expect(isValidIqama("1012345678")).toBe(true);
    expect(isValidIqama("3412345678")).toBe(false);
    expect(isValidIqama("241234567")).toBe(false);
  });
  it("worker form normalizes numbers and amounts", () => {
    const r = workerCreateSchema.parse({ name: "Ali Hassan", iqamaNumber: "٢٤١٢٣٤٥٦٧٨", phone: "05 1234 5678", basicSalary: "1500.50", passportNumber: "a 123456", iqamaExpiry: "15/03/2027" });
    expect(r.iqamaNumber).toBe("2412345678");
    expect(r.phone).toBe("+966512345678");
    expect(r.basicSalary).toBe(150050);
    expect(r.housingAllowance).toBe(0);
    expect(r.passportNumber).toBe("A123456");
    expect(toDateInput(r.iqamaExpiry)).toBe("2027-03-15");
  });
  it("worker form rejects bad values with translation keys", () => {
    const r = workerCreateSchema.safeParse({ name: "A", iqamaNumber: "123", basicSalary: "12.345", iqamaExpiry: "99/99/2027" });
    expect(r.success).toBe(false);
    const messages = Object.fromEntries(r.error!.issues.map((i) => [String(i.path[0]), i.message]));
    expect(messages).toMatchObject({ name: "required", iqamaNumber: "invalidIqama", basicSalary: "invalidAmount", iqamaExpiry: "invalidDate" });
  });
  it("client VAT and phone", () => {
    expect(clientSchema.safeParse({ nameEn: "Gulf Co", vatNumber: "300000000000003", phone: "013 800 0000" }).success).toBe(true);
    expect(clientSchema.safeParse({ nameEn: "Gulf Co", vatNumber: "12345" }).success).toBe(false);
  });
  it("return paths stay inside the app", () => {
    expect(safeReturnPath("/app/clients/abc", "/x")).toBe("/app/clients/abc");
    expect(safeReturnPath("https://evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("//evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("/app/../../etc", "/x")).toBe("/x");
  });
});
