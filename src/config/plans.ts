/**
 * Subscription plans and prices. Prices are placeholders to be validated with
 * the first customers. Never hardcode prices in components: read them here.
 * Amounts are integers in halalas (1 SAR = 100 halalas) and exclude VAT.
 */
export const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;
export type BillingCycleCode = (typeof BILLING_CYCLES)[number];

export const CYCLE_MONTHS: Record<BillingCycleCode, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

/** Months actually charged per cycle. Yearly = pay 10 months, get 2 free. */
export const CYCLE_BILLED_MONTHS: Record<BillingCycleCode, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 10,
};

export const PLANS = [
  { code: "STARTER", monthlyPriceHalalas: 9_900, maxWorkers: 25, maxInvoicesPerMonth: 30 },
  { code: "PRO", monthlyPriceHalalas: 19_900, maxWorkers: 100, maxInvoicesPerMonth: 150 },
  { code: "BUSINESS", monthlyPriceHalalas: 39_900, maxWorkers: 500, maxInvoicesPerMonth: 1_000 },
] as const;

export type PlanCode = (typeof PLANS)[number]["code"];

export function getPlan(code: PlanCode) {
  const plan = PLANS.find((p) => p.code === code);
  if (!plan) throw new Error(`Unknown plan: ${code}`);
  return plan;
}

export interface CyclePrice {
  /** Amount charged for the whole cycle, in halalas, excluding VAT. */
  totalHalalas: number;
  /** What the same months would cost at the monthly price. */
  undiscountedHalalas: number;
  savedHalalas: number;
  freeMonths: number;
  months: number;
}

export function priceFor(code: PlanCode, cycle: BillingCycleCode): CyclePrice {
  const monthly = getPlan(code).monthlyPriceHalalas;
  const months = CYCLE_MONTHS[cycle];
  const billed = CYCLE_BILLED_MONTHS[cycle];
  const totalHalalas = monthly * billed;
  const undiscountedHalalas = monthly * months;
  return {
    totalHalalas,
    undiscountedHalalas,
    savedHalalas: undiscountedHalalas - totalHalalas,
    freeMonths: months - billed,
    months,
  };
}
