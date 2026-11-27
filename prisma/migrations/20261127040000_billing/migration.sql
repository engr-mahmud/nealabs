-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "scheduledCycle" "BillingCycle",
ADD COLUMN     "scheduledFrom" TIMESTAMP(3),
ADD COLUMN     "scheduledPlanCode" TEXT;

-- CreateTable
CREATE TABLE "billing_checkouts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "planCode" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "gateway" TEXT NOT NULL,
    "gatewayRef" TEXT,
    "gatewayPaymentId" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "planCode" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_counters" (
    "key" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_counters_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_checkouts_gatewayRef_key" ON "billing_checkouts"("gatewayRef");

-- CreateIndex
CREATE INDEX "billing_checkouts_organizationId_createdAt_idx" ON "billing_checkouts"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_checkoutId_key" ON "subscription_invoices"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_number_key" ON "subscription_invoices"("number");

-- CreateIndex
CREATE INDEX "subscription_invoices_organizationId_issuedAt_idx" ON "subscription_invoices"("organizationId", "issuedAt");

-- AddForeignKey
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "billing_checkouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Money sanity checks (integer halalas).
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_amounts_check"
  CHECK ("subtotal" > 0 AND "vatAmount" >= 0 AND "total" = "subtotal" + "vatAmount");
ALTER TABLE "billing_checkouts" ADD CONSTRAINT "billing_checkouts_paid_check"
  CHECK ("status" <> 'PAID' OR ("paidAt" IS NOT NULL AND "periodStart" IS NOT NULL AND "periodEnd" IS NOT NULL));
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_amounts_check"
  CHECK ("subtotal" > 0 AND "vatAmount" >= 0 AND "total" = "subtotal" + "vatAmount" AND "periodEnd" > "periodStart");

-- Row Level Security: same tenant policy as the earlier migrations.
-- billing_counters is the seller's own numbering and holds no tenant data.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_checkouts', 'subscription_invoices'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organizationId" = current_setting(''app.org_id'', true)
                OR current_setting(''app.bypass_rls'', true) = ''on'')
         WITH CHECK ("organizationId" = current_setting(''app.org_id'', true)
                OR current_setting(''app.bypass_rls'', true) = ''on'')', t);
  END LOOP;
END $$;
