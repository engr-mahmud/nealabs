-- AlterEnum
ALTER TYPE "SalesDocType" ADD VALUE 'CREDIT_NOTE';

-- AlterTable
ALTER TABLE "sales_documents" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditedInvoiceId" TEXT,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "sales_documents_creditedInvoiceId_idx" ON "sales_documents"("creditedInvoiceId");

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_creditedInvoiceId_organizationId_fkey" FOREIGN KEY ("creditedInvoiceId", "organizationId") REFERENCES "sales_documents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing rows: nothing credited yet, so the balance is what is still unpaid.
-- FORCE RLS applies to the migration role too, so bypass it for this data update only.
SELECT set_config('app.bypass_rls', 'on', false);
UPDATE "sales_documents" SET "balance" = GREATEST(0, "total" - "paidAmount" - "creditedAmount");
SELECT set_config('app.bypass_rls', '', false);

-- (type::text because a new enum value cannot be used in the transaction that adds it.)
ALTER TABLE "sales_documents"
  DROP CONSTRAINT "sales_documents_number_check",
  DROP CONSTRAINT "sales_documents_issued_check",
  ADD CONSTRAINT "sales_documents_number_check" CHECK ("type"::text NOT IN ('INVOICE', 'CREDIT_NOTE') OR "status" = 'DRAFT' OR "number" IS NOT NULL),
  ADD CONSTRAINT "sales_documents_issued_check" CHECK ("type"::text NOT IN ('INVOICE', 'CREDIT_NOTE') OR "status" = 'DRAFT' OR "issuedAt" IS NOT NULL),
  ADD CONSTRAINT "sales_documents_credit_check" CHECK (
    "creditedAmount" >= 0 AND "creditedAmount" <= "total"
    AND "balance" = GREATEST(0, "total" - "paidAmount" - "creditedAmount")
    AND (("type"::text = 'CREDIT_NOTE') = ("creditedInvoiceId" IS NOT NULL))
  );
