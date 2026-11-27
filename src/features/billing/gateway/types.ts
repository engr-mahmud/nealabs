/**
 * Payment gateway behind one small interface, so the provider (Moyasar today, Tap or
 * another later) is a config change. The gateway only collects money; subscription
 * state is changed by our own code after it has confirmed the payment with the gateway.
 */
export type GatewayName = "test" | "moyasar";

export interface CreateCheckoutInput {
  checkoutId: string;
  /** Halalas including VAT. */
  amount: number;
  description: string;
  /** Where the customer comes back to after paying or pressing back. */
  returnUrl: string;
  expiresAt: Date;
}

export interface CreatedCheckout {
  /** The gateway's id for this checkout (stored as gatewayRef). */
  ref: string;
  /** Hosted payment page the customer is sent to. */
  url: string;
}

export type GatewayStatus = "paid" | "failed" | "pending" | "expired";

export interface GatewayCheckoutState {
  status: GatewayStatus;
  /** Amount the gateway says was charged, halalas. */
  amount: number;
  currency: string;
  paymentId: string | null;
  failureReason: string | null;
  /** False for sandbox / test payments. */
  live: boolean;
}

export interface PaymentGateway {
  readonly name: GatewayName;
  createCheckout(input: CreateCheckoutInput): Promise<CreatedCheckout>;
  /** Reads the checkout from the gateway itself. This, never a redirect or webhook body, is the source of truth. */
  fetchCheckout(ref: string): Promise<GatewayCheckoutState>;
}

export class GatewayError extends Error {}
