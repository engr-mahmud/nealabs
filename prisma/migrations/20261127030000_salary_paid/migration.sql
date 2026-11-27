-- AlterTable
ALTER TABLE "salary_sheet_lines" ADD COLUMN     "paidAt" DATE,
ADD COLUMN     "paidById" TEXT;

-- AlterTable
ALTER TABLE "salary_sheets" ADD COLUMN     "paidNet" INTEGER NOT NULL DEFAULT 0;


-- Paid amounts can never exceed the sheet's net pay, and only approved sheets have paid workers.
ALTER TABLE "salary_sheets"
  ADD CONSTRAINT "salary_sheets_paid_check" CHECK (
    "paidNet" >= 0 AND "paidNet" <= "totalNet" AND ("status" = 'APPROVED' OR "paidNet" = 0)
  );
