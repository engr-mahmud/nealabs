-- CreateEnum
CREATE TYPE "SalarySheetStatus" AS ENUM ('DRAFT', 'APPROVED');

-- CreateEnum
CREATE TYPE "PayBase" AS ENUM ('BASIC', 'GROSS');

-- CreateTable
CREATE TABLE "payroll_settings" (
    "organizationId" TEXT NOT NULL,
    "overtimeBase" "PayBase" NOT NULL DEFAULT 'GROSS',
    "overtimePremium" INTEGER NOT NULL DEFAULT 5000,
    "hoursPerDay" INTEGER NOT NULL DEFAULT 8,
    "monthDays" INTEGER NOT NULL DEFAULT 30,
    "absenceBase" "PayBase" NOT NULL DEFAULT 'GROSS',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "salary_sheets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "siteId" TEXT,
    "status" "SalarySheetStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "overtimeBase" "PayBase" NOT NULL,
    "overtimePremium" INTEGER NOT NULL,
    "hoursPerDay" INTEGER NOT NULL,
    "monthDays" INTEGER NOT NULL,
    "absenceBase" "PayBase" NOT NULL,
    "workerCount" INTEGER NOT NULL DEFAULT 0,
    "totalGross" INTEGER NOT NULL DEFAULT 0,
    "totalOvertime" INTEGER NOT NULL DEFAULT 0,
    "totalAdditions" INTEGER NOT NULL DEFAULT 0,
    "totalDeductions" INTEGER NOT NULL DEFAULT 0,
    "totalNet" INTEGER NOT NULL DEFAULT 0,
    "payDate" DATE,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_sheet_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "workerName" TEXT NOT NULL,
    "workerNameAr" TEXT,
    "iqamaLast4" TEXT NOT NULL,
    "jobTitle" TEXT,
    "siteId" TEXT,
    "siteName" TEXT,
    "basicSalary" INTEGER NOT NULL,
    "housingAllowance" INTEGER NOT NULL,
    "transportAllowance" INTEGER NOT NULL,
    "otherAllowance" INTEGER NOT NULL,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "overtimeHours" INTEGER NOT NULL DEFAULT 0,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "advances" INTEGER NOT NULL DEFAULT 0,
    "deductions" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "grossSalary" INTEGER NOT NULL,
    "absenceDeduction" INTEGER NOT NULL DEFAULT 0,
    "overtimePay" INTEGER NOT NULL DEFAULT 0,
    "netPay" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_sheet_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_sheets_organizationId_year_month_idx" ON "salary_sheets"("organizationId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "salary_sheets_id_organizationId_key" ON "salary_sheets"("id", "organizationId");

-- CreateIndex
CREATE INDEX "salary_sheet_lines_sheetId_idx" ON "salary_sheet_lines"("sheetId");

-- CreateIndex
CREATE INDEX "salary_sheet_lines_workerId_idx" ON "salary_sheet_lines"("workerId");

-- CreateIndex
CREATE INDEX "salary_sheet_lines_siteId_idx" ON "salary_sheet_lines"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_sheet_lines_organizationId_year_month_workerId_key" ON "salary_sheet_lines"("organizationId", "year", "month", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "workers_id_organizationId_key" ON "workers"("id", "organizationId");

-- AddForeignKey
ALTER TABLE "finance_entries" ADD CONSTRAINT "finance_entries_salarySheetId_organizationId_fkey" FOREIGN KEY ("salarySheetId", "organizationId") REFERENCES "salary_sheets"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheets" ADD CONSTRAINT "salary_sheets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheets" ADD CONSTRAINT "salary_sheets_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "sites"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheet_lines" ADD CONSTRAINT "salary_sheet_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheet_lines" ADD CONSTRAINT "salary_sheet_lines_sheetId_organizationId_fkey" FOREIGN KEY ("sheetId", "organizationId") REFERENCES "salary_sheets"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheet_lines" ADD CONSTRAINT "salary_sheet_lines_workerId_organizationId_fkey" FOREIGN KEY ("workerId", "organizationId") REFERENCES "workers"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_sheet_lines" ADD CONSTRAINT "salary_sheet_lines_siteId_organizationId_fkey" FOREIGN KEY ("siteId", "organizationId") REFERENCES "sites"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Payroll numbers must stay consistent even if a bug slips past the service layer.
ALTER TABLE "payroll_settings"
  ADD CONSTRAINT "payroll_settings_check" CHECK (
    "overtimePremium" BETWEEN 0 AND 30000
    AND "hoursPerDay" BETWEEN 1 AND 24
    AND ("monthDays" = 0 OR "monthDays" BETWEEN 20 AND 31)
  );

ALTER TABLE "salary_sheets"
  ADD CONSTRAINT "salary_sheets_period_check" CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 2200),
  ADD CONSTRAINT "salary_sheets_approved_check" CHECK (
    ("status" = 'DRAFT' AND "approvedAt" IS NULL)
    OR ("status" = 'APPROVED' AND "approvedAt" IS NOT NULL AND "payDate" IS NOT NULL)
  ),
  ADD CONSTRAINT "salary_sheets_totals_check" CHECK (
    "totalNet" >= 0
    AND "totalNet" = "totalGross" + "totalOvertime" + "totalAdditions" - "totalDeductions"
  );

ALTER TABLE "salary_sheet_lines"
  ADD CONSTRAINT "salary_sheet_lines_amounts_check" CHECK (
    "basicSalary" >= 0 AND "housingAllowance" >= 0 AND "transportAllowance" >= 0 AND "otherAllowance" >= 0
    AND "absentDays" BETWEEN 0 AND 31000
    AND "overtimeHours" BETWEEN 0 AND 400000
    AND "additions" >= 0 AND "advances" >= 0 AND "deductions" >= 0
    AND "grossSalary" = "basicSalary" + "housingAllowance" + "transportAllowance" + "otherAllowance"
    AND "absenceDeduction" BETWEEN 0 AND "grossSalary"
    AND "overtimePay" >= 0
    AND "netPay" >= 0
    AND "netPay" = "grossSalary" - "absenceDeduction" + "overtimePay" + "additions" - "advances" - "deductions"
  );

-- Row Level Security: same tenant policy as the earlier migrations.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payroll_settings', 'salary_sheets', 'salary_sheet_lines'] LOOP
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
