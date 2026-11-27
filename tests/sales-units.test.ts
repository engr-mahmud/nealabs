import { describe, expect, it } from "vitest";
import { computeTotals, formatPercent, formatQuantity, lineTotal, mulDivRound, parsePercent, parseQuantity } from "@/features/sales/totals";
import { amountString, decodeZatcaQr, qrTimestamp, zatcaQrPayload } from "@/features/sales/zatca-qr";
import { displayStatus, type StatusInput } from "@/features/sales/status";
import { salesDocSchema } from "@/features/sales/schemas";
import { AppError } from "@/lib/errors";

const vat = 1500;

describe("VAT and totals", () => {
  it("adds 15% VAT to a simple invoice", () => {
    const t = computeTotals({ lines: [{ quantity: 1000, unitPrice: 100000 }], discountType: "NONE", discountValue: 0, vatRate: vat });
    expect(t).toEqual({ lineTotals: [100000], subtotal: 100000, discountAmount: 0, taxableAmount: 100000, vatAmount: 15000, total: 115000 });
  });

  it("multiplies decimal quantities and rounds each line half up", () => {
    // 26 days x 85.50 SAR = 2223.00; 7.5 hours x 12.33 = 92.475 → 92.48
    expect(lineTotal({ quantity: 26000, unitPrice: 8550 })).toBe(222300);
    expect(lineTotal({ quantity: 7500, unitPrice: 1233 })).toBe(9248);
    expect(lineTotal({ quantity: 1, unitPrice: 499 })).toBe(0); // 0.001 x 4.99 = 0.00499
  });

  it("applies a percent discount before VAT", () => {
    const t = computeTotals({ lines: [{ quantity: 3000, unitPrice: 33333 }], discountType: "PERCENT", discountValue: 1000, vatRate: vat });
    expect(t.subtotal).toBe(99999);
    expect(t.discountAmount).toBe(10000); // 9999.9 → 10000
    expect(t.taxableAmount).toBe(89999);
    expect(t.vatAmount).toBe(13500); // 13499.85 → 13500
    expect(t.total).toBe(103499);
  });

  it("applies an amount discount and never discounts more than the subtotal", () => {
    const lines = [{ quantity: 1000, unitPrice: 50000 }];
    expect(computeTotals({ lines, discountType: "AMOUNT", discountValue: 5000, vatRate: vat }).total).toBe(51750);
    const capped = computeTotals({ lines, discountType: "AMOUNT", discountValue: 999999, vatRate: vat });
    expect(capped).toMatchObject({ discountAmount: 50000, taxableAmount: 0, vatAmount: 0, total: 0 });
  });

  it("calculates VAT once on the total, so totals always add up", () => {
    const lines = Array.from({ length: 7 }, () => ({ quantity: 1000, unitPrice: 333 }));
    const t = computeTotals({ lines, discountType: "NONE", discountValue: 0, vatRate: vat });
    expect(t.subtotal).toBe(2331);
    expect(t.vatAmount).toBe(350); // 349.65 → 350
    expect(t.total).toBe(t.taxableAmount + t.vatAmount);
  });

  it("stays exact for large amounts (no float errors)", () => {
    expect(mulDivRound(1_000_000_000, 999_999_999, 1000)).toBe(999_999_999_000_000);
    const t = computeTotals({ lines: [{ quantity: 1_000_000, unitPrice: 123_456_789 }], discountType: "NONE", discountValue: 0, vatRate: vat });
    expect(t.vatAmount).toBe(18_518_518_350);
  });

  it("parses quantities and percents typed by users", () => {
    expect(parseQuantity("26")).toBe(26000);
    expect(parseQuantity("7.5")).toBe(7500);
    expect(parseQuantity("١٫٢٥")).toBe(1250);
    expect(parseQuantity("1,000")).toBe(1_000_000);
    expect(parseQuantity("0")).toBeNull();
    expect(parseQuantity("1.2345")).toBeNull();
    expect(parseQuantity("-1")).toBeNull();
    expect(formatQuantity(7500)).toBe("7.5");
    expect(formatQuantity(26000)).toBe("26");
    expect(parsePercent("12.5")).toBe(1250);
    expect(parsePercent("101")).toBeNull();
    expect(formatPercent(1250)).toBe("12.5");
  });

  it("validates the document form", () => {
    const ok = salesDocSchema.safeParse({ clientId: "c1", discountType: "PERCENT", discountValue: "5" });
    expect(ok.success && ok.data.discountValue).toBe(500);
    const zero = salesDocSchema.safeParse({ clientId: "c1", discountType: "AMOUNT", discountValue: "0" });
    expect(zero.success && zero.data.discountType).toBe("NONE");
    const bad = salesDocSchema.safeParse({ clientId: "c1", discountType: "PERCENT", discountValue: "150", issueDate: "2026-12-10", dueDate: "2026-12-01" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path[0]).sort()).toEqual(["discountValue", "dueDate"]);
  });
});

describe("ZATCA Phase 1 QR", () => {
  it("encodes the five TLV fields as Base64", () => {
    const payload = zatcaQrPayload({
      sellerName: "Bobs Records",
      vatNumber: "310122393500003",
      timestamp: new Date("2022-04-25T15:30:00Z"),
      total: 100000,
      vatAmount: 15000,
    });
    // Built by hand from the specification: tag, length, UTF-8 value.
    const expected = Buffer.concat(
      [
        [1, "Bobs Records"],
        [2, "310122393500003"],
        [3, "2022-04-25T15:30:00Z"],
        [4, "1000.00"],
        [5, "150.00"],
      ].map(([tag, v]) => {
        const b = Buffer.from(v as string, "utf8");
        return Buffer.concat([Buffer.from([tag as number, b.length]), b]);
      }),
    ).toString("base64");
    expect(payload).toBe(expected);
    expect(payload).toBe("AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==");
  });

  it("counts Arabic names in UTF-8 bytes, not characters", () => {
    const name = "شركة النخبة للمقاولات";
    const payload = zatcaQrPayload({ sellerName: name, vatNumber: "300000000000003", timestamp: new Date("2026-11-27T09:05:07.123Z"), total: 115050, vatAmount: 15006 });
    const raw = Buffer.from(payload, "base64");
    expect(raw[1]).toBe(Buffer.byteLength(name, "utf8"));
    expect(decodeZatcaQr(payload)).toEqual({ 1: name, 2: "300000000000003", 3: "2026-11-27T09:05:07Z", 4: "1150.50", 5: "150.06" });
  });

  it("rejects a value longer than 255 bytes", () => {
    expect(() => zatcaQrPayload({ sellerName: "ش".repeat(130), vatNumber: "300000000000003", timestamp: new Date(), total: 1, vatAmount: 0 })).toThrow(AppError);
  });

  it("formats amounts and time", () => {
    expect(amountString(5)).toBe("0.05");
    expect(amountString(123456)).toBe("1234.56");
    expect(qrTimestamp(new Date("2026-01-02T03:04:05.678Z"))).toBe("2026-01-02T03:04:05Z");
  });
});

describe("document status", () => {
  const today = new Date("2026-11-27T00:00:00Z");
  const due = new Date("2026-12-01T00:00:00Z");
  const inv = (o: Partial<StatusInput> = {}): StatusInput => {
    const d = { type: "INVOICE" as const, status: "SENT" as const, total: 1000, paidAmount: 0, creditedAmount: 0, dueDate: due, converted: false, ...o };
    return { ...d, balance: Math.max(0, d.total - d.paidAmount - d.creditedAmount) };
  };

  it("derives invoice payment status", () => {
    expect(displayStatus(inv({ status: "DRAFT" }), today)).toBe("draft");
    expect(displayStatus(inv(), today)).toBe("sent");
    expect(displayStatus(inv({ paidAmount: 400 }), today)).toBe("partial");
    expect(displayStatus(inv({ paidAmount: 1000 }), today)).toBe("paid");
    expect(displayStatus(inv({ dueDate: new Date("2026-11-26T00:00:00Z") }), today)).toBe("due");
    expect(displayStatus(inv({ dueDate: today }), today)).toBe("sent"); // due today is not overdue yet
    expect(displayStatus(inv({ paidAmount: 1000, dueDate: new Date("2026-01-01T00:00:00Z") }), today)).toBe("paid");
  });

  it("counts credit notes against the balance", () => {
    expect(displayStatus(inv({ creditedAmount: 300 }), today)).toBe("partial");
    expect(displayStatus(inv({ creditedAmount: 300, paidAmount: 700 }), today)).toBe("paid");
    expect(displayStatus(inv({ creditedAmount: 1000 }), today)).toBe("credited");
  });

  it("shows converted quotations and proformas", () => {
    expect(displayStatus(inv({ type: "QUOTATION", status: "DRAFT" }), today)).toBe("draft");
    expect(displayStatus(inv({ type: "QUOTATION" }), today)).toBe("sent");
    expect(displayStatus(inv({ type: "PROFORMA", converted: true }), today)).toBe("converted");
    expect(displayStatus(inv({ type: "CREDIT_NOTE" }), today)).toBe("sent");
  });
});
