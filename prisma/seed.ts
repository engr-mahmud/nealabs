/**
 * Demo data for local development and the demo environment.
 * Login: owner@demo.test / demo12345 (Owner), accountant@demo.test / demo12345 (Accountant).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/features/auth/password";
import { createOrganization } from "../src/features/organizations/service";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to seed demo data in production. Set ALLOW_DEMO_SEED=true for a demo server.");
  }
  if (await prisma.user.findUnique({ where: { email: "owner@demo.test" } })) {
    console.log("Demo data already exists. Skipping.");
    return;
  }
  const passwordHash = await hashPassword("demo12345");
  const owner = await prisma.user.create({ data: { name: "Demo Owner", email: "owner@demo.test", phone: "+966500000001", phoneVerifiedAt: new Date(), passwordHash } });
  const accountant = await prisma.user.create({ data: { name: "Demo Accountant", email: "accountant@demo.test", phone: "+966500000002", phoneVerifiedAt: new Date(), passwordHash } });

  const org = await createOrganization(owner.id, { nameEn: "Demo Manpower Co", nameAr: "شركة ديمو لتوريد العمالة" });
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      crNumber: "1010000000",
      vatNumber: "300000000000003",
      addressLine: "King Fahd Road",
      city: "Dammam",
      postalCode: "32241",
      bankName: "Demo Bank",
      bankAccountName: "Demo Manpower Co",
      iban: "SA0380000000608010167519",
      setupCompletedAt: new Date(),
    },
  });
  await prisma.membership.create({ data: { userId: accountant.id, organizationId: org.id, role: "ACCOUNTANT" } });
  console.log("Seeded: owner@demo.test / accountant@demo.test (password demo12345)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
