-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "pendingPhone" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "phone_verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phone_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_claims" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "phone_verification_codes_userId_createdAt_idx" ON "phone_verification_codes"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_phone_key" ON "trial_claims"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "trial_claims_email_key" ON "trial_claims"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- AddForeignKey
ALTER TABLE "phone_verification_codes" ADD CONSTRAINT "phone_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Accounts created before phone verification keep the trial of their first company.
SELECT set_config('app.bypass_rls', 'on', false);
UPDATE "users" u SET "trialEndsAt" = s.first_trial
FROM (
  SELECT o."createdById" AS user_id, MIN(sub."trialEndsAt") AS first_trial
  FROM "organizations" o JOIN "subscriptions" sub ON sub."organizationId" = o.id
  GROUP BY o."createdById"
) s
WHERE s.user_id = u.id;
SELECT set_config('app.bypass_rls', '', false);
