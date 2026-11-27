import type { PaymentGateway } from "./types";

/**
 * Built-in test gateway for local development and the demo. No money moves: the
 * "payment page" is our own /app/billing/test-pay page, which records the outcome
 * itself (see simulateTestPayment). The gateway ref is the checkout id.
 */
export const testGateway: PaymentGateway = {
  name: "test",
  async createCheckout(input) {
    return { ref: `test_${input.checkoutId}`, url: `/app/billing/test-pay/${encodeURIComponent(input.checkoutId)}` };
  },
  async fetchCheckout() {
    // The test page applies its result directly, so a pending checkout stays pending here.
    return { status: "pending", amount: 0, currency: "SAR", paymentId: null, failureReason: null, live: false };
  },
};
