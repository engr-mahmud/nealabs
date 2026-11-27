import "server-only";
import { env } from "@/lib/env";
import { moyasarGateway } from "./moyasar";
import { testGateway } from "./test-gateway";
import type { GatewayName, PaymentGateway } from "./types";

export function activeGatewayName(): GatewayName {
  return env().PAYMENT_GATEWAY;
}

/** The gateway that created a checkout (so old checkouts still resolve after a switch). */
export function gatewayFor(name: string): PaymentGateway {
  if (name === "moyasar") return moyasarGateway;
  if (name === "test") return testGateway;
  throw new Error(`Unknown payment gateway: ${name}`);
}

export function activeGateway(): PaymentGateway {
  return gatewayFor(activeGatewayName());
}
