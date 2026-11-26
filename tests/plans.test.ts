import { describe, expect, it } from "vitest";
import { PLANS, priceFor } from "@/config/plans";

describe("billing cycle pricing", () => {
  for (const plan of PLANS) {
    const monthly = plan.monthlyPriceHalalas;

    it(`${plan.code}: monthly is the monthly price`, () => {
      expect(priceFor(plan.code, "MONTHLY")).toMatchObject({ totalHalalas: monthly, savedHalalas: 0, freeMonths: 0, months: 1 });
    });

    it(`${plan.code}: quarterly is 3 x monthly with no discount`, () => {
      expect(priceFor(plan.code, "QUARTERLY")).toMatchObject({ totalHalalas: monthly * 3, savedHalalas: 0, months: 3 });
    });

    it(`${plan.code}: yearly is 10 x monthly, 2 months free`, () => {
      const yearly = priceFor(plan.code, "YEARLY");
      expect(yearly.totalHalalas).toBe(monthly * 10);
      expect(yearly.undiscountedHalalas).toBe(monthly * 12);
      expect(yearly.savedHalalas).toBe(monthly * 2);
      expect(yearly.freeMonths).toBe(2);
      expect(Number.isInteger(yearly.totalHalalas)).toBe(true);
    });
  }
});
