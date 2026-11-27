-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinanceSource" AS ENUM ('MANUAL', 'INVOICE_PAYMENT', 'INVOICE_REFUND', 'SALARY_SHEET');

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "systemKey" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "source" "FinanceSource" NOT NULL DEFAULT 'MANUAL',
    "categoryId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "reference" TEXT,
    "method" "PaymentMethod",
    "clientId" TEXT,
    "siteId" TEXT,
    "salesPaymentId" TEXT,
    "salesDocumentId" TEXT,
    "salarySheetId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_categories_organizationId_kind_archivedAt_idx" ON "finance_categories"("organizationId", "kind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_id_organizationId_key" ON "finance_categories"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_categories_organizationId_kind_systemKey_key" ON "finance_categories"("organizationId", "kind", "systemKey");

-- CreateIndex
CREATE INDEX "finance_entries_organizationId_date_idx" ON "finance_entries"("organizationId", "date");

-- CreateIndex
CREATE INDEX "finance_entries_organizationId_kind_date_idx" ON "finance_entries"("organizationId", "kind", "date");

-- CreateIndex
CREATE INDEX "finance_entries_organizationId_siteId_date_idx" ON "finance_entries"("organizationId", "siteId", "date");

-- CreateIndex
CREATE INDEX "finance_entries_organizationId_salarySheetId_idx" ON "finance_entries"("organizationId", "salarySheetId");

-- CreateIndex
CREATE INDEX "finance_entries_salesDocumentId_idx" ON "finance_entries"("salesDocumentId");

-- CreateIndex
CREATE INDEX "finance_entries_categoryId_idx" ON "finance_entries"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "finance_entries_salesPaymentId_organizationId_key" ON "finance_entries"("salesPaymentId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_payments_id_organizationId_key" ON "sales_payments"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_categoryId_organizationId_fkey" FOREIGN KEY ("categoryId", "organizationId") REFERENCES "finance_categories"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_clientId_organizationId_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "clients"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "sites"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_salesPaymentId_organizationId_fkey" FOREIGN KEY ("salesPaymentId", "organizationId") REFERENCES "sales_payments"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_salesDocumentId_organizationId_fkey" FOREIGN KEY ("salesDocumentId", "organizationId") REFERENCES "sales_documents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Amounts and sources must stay consistent even if a bug slips past the service layer.
-- Only refunds are negative (they reduce income); VAT always has the same sign as the amount.
ALTER TABLE "finance_entries"
  ADD CONSTRAINT "finance_entries_amount_check" CHECK (
    ("source" <> 'INVOICE_REFUND' AND "amount" > 0 AND "vatAmount" >= 0 AND "vatAmount" <= "amount")
    OR ("source" = 'INVOICE_REFUND' AND "amount" < 0 AND "vatAmount" <= 0 AND "vatAmount" >= "amount")
  ),
  ADD CONSTRAINT "finance_entries_source_check" CHECK (
    ("source" = 'MANUAL' AND "salesPaymentId" IS NULL AND "salesDocumentId" IS NULL AND "salarySheetId" IS NULL)
    OR ("source" = 'INVOICE_PAYMENT' AND "kind" = 'INCOME' AND "salesPaymentId" IS NOT NULL AND "salesDocumentId" IS NULL)
    OR ("source" = 'INVOICE_REFUND' AND "kind" = 'INCOME' AND "salesDocumentId" IS NOT NULL AND "salesPaymentId" IS NULL)
    OR ("source" = 'SALARY_SHEET' AND "kind" = 'EXPENSE' AND "salarySheetId" IS NOT NULL)
  );

-- Row Level Security: same tenant policy as the earlier migrations.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['finance_categories', 'finance_entries'] LOOP
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
