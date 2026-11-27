-- CreateEnum
CREATE TYPE "SalesDocType" AS ENUM ('QUOTATION', 'PROFORMA', 'INVOICE');

-- CreateEnum
CREATE TYPE "SalesDocStatus" AS ENUM ('DRAFT', 'SENT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER');

-- CreateTable
CREATE TABLE "document_counters" (
    "organizationId" TEXT NOT NULL,
    "type" "SalesDocType" NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("organizationId","type")
);

-- CreateTable
CREATE TABLE "sales_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "SalesDocType" NOT NULL,
    "status" "SalesDocStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT,
    "sourceId" TEXT,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "issuedAt" TIMESTAMP(3),
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "vatRate" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "taxableAmount" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "terms" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_document_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "descriptionAr" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "sales_document_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_sourceId_key" ON "sales_documents"("sourceId");

-- CreateIndex
CREATE INDEX "sales_documents_organizationId_type_createdAt_idx" ON "sales_documents"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "sales_documents_organizationId_type_status_dueDate_idx" ON "sales_documents"("organizationId", "type", "status", "dueDate");

-- CreateIndex
CREATE INDEX "sales_documents_clientId_idx" ON "sales_documents"("clientId");

-- CreateIndex
CREATE INDEX "sales_documents_siteId_idx" ON "sales_documents"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_id_organizationId_key" ON "sales_documents"("id", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_documents_organizationId_type_number_key" ON "sales_documents"("organizationId", "type", "number");

-- CreateIndex
CREATE INDEX "sales_document_lines_documentId_position_idx" ON "sales_document_lines"("documentId", "position");

-- CreateIndex
CREATE INDEX "sales_payments_documentId_idx" ON "sales_payments"("documentId");

-- CreateIndex
CREATE INDEX "sales_payments_organizationId_paidOn_idx" ON "sales_payments"("organizationId", "paidOn");

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_clientId_organizationId_fkey" FOREIGN KEY ("clientId", "organizationId") REFERENCES "clients"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "sites"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_documents" ADD CONSTRAINT "sales_documents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sales_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_document_lines" ADD CONSTRAINT "sales_document_lines_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "sales_documents"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_payments" ADD CONSTRAINT "sales_payments_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "sales_documents"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Amounts must stay consistent even if a bug slips past the service layer.
ALTER TABLE "sales_documents"
  ADD CONSTRAINT "sales_documents_amounts_check" CHECK (
    "subtotal" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "subtotal"
    AND "taxableAmount" = "subtotal" - "discountAmount"
    AND "vatAmount" >= 0 AND "total" = "taxableAmount" + "vatAmount"
    AND "paidAmount" >= 0 AND "paidAmount" <= "total"
  ),
  ADD CONSTRAINT "sales_documents_number_check" CHECK ("type" <> 'INVOICE' OR "status" = 'DRAFT' OR "number" IS NOT NULL),
  ADD CONSTRAINT "sales_documents_issued_check" CHECK ("type" <> 'INVOICE' OR "status" = 'DRAFT' OR "issuedAt" IS NOT NULL);
ALTER TABLE "sales_document_lines"
  ADD CONSTRAINT "sales_document_lines_values_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "sales_payments"
  ADD CONSTRAINT "sales_payments_amount_check" CHECK ("amount" > 0);

-- Row Level Security: same tenant policy as the earlier migrations.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_counters', 'sales_documents', 'sales_document_lines', 'sales_payments'] LOOP
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
