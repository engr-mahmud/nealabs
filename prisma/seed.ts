/**
 * Demo data for local development and the demo environment.
 * Login: owner@demo.test / demo12345 (Owner), accountant@demo.test / demo12345 (Accountant).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/features/auth/password";
import { createOrganization } from "../src/features/organizations/service";
import { loadOrgContext } from "../src/features/organizations/context";
import { createClient } from "../src/features/clients/service";
import { createSite } from "../src/features/sites/service";
import { addPayment, convertSalesDoc, createCreditNote, createSalesDoc, issueInvoice, issueTaxDocument } from "../src/features/sales/service";
import { createWorker } from "../src/features/workforce/service";
import { todayInRiyadh } from "../src/features/master-data/expiry";

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

  // Master data: 2 clients, 3 sites, 6 workers (some documents expiring soon, one expired).
  const ctx = await loadOrgContext(owner.id, org.id);
  if (!ctx) throw new Error("Seed: owner context missing");
  const blank = { nameAr: null, crNumber: null, contactName: null, phone: null, email: null, addressLine: null, postalCode: null, notes: null };
  const gulf = await createClient(ctx, { ...blank, nameEn: "Gulf Construction Co", nameAr: "شركة الخليج للإنشاءات", vatNumber: "310123456700003", contactName: "Ahmed Ali", city: "Dammam" });
  const eastern = await createClient(ctx, { ...blank, nameEn: "Eastern Facilities Services", vatNumber: null, city: "Al Khobar" });
  const jubail = await createSite(ctx, { clientId: gulf.id, name: "Jubail Plant", city: "Jubail", address: null, notes: null });
  const dammam = await createSite(ctx, { clientId: gulf.id, name: "Dammam Tower", city: "Dammam", address: null, notes: null });
  const khobar = await createSite(ctx, { clientId: eastern.id, name: "Khobar Mall", city: "Al Khobar", address: null, notes: null });
  const today = todayInRiyadh();
  const inDays = (d: number) => new Date(today.getTime() + d * 86_400_000);
  const workers = [
    { name: "Mohammad Rahim", iqamaNumber: "2412345671", nationality: "Bangladesh", jobTitle: "Electrician", siteId: jubail.id, basicSalary: 150000, iqamaExpiry: inDays(12) },
    { name: "Rajesh Kumar", iqamaNumber: "2412345672", nationality: "India", jobTitle: "Welder", siteId: jubail.id, basicSalary: 180000, iqamaExpiry: inDays(200) },
    { name: "Imran Khan", iqamaNumber: "2412345673", nationality: "Pakistan", jobTitle: "Driver", siteId: dammam.id, basicSalary: 140000, iqamaExpiry: inDays(-3) },
    { name: "Ram Bahadur", iqamaNumber: "2412345674", nationality: "Nepal", jobTitle: "Helper", siteId: dammam.id, basicSalary: 120000, iqamaExpiry: inDays(90) },
    { name: "Jose Santos", iqamaNumber: "2412345675", nationality: "Philippines", jobTitle: "Cleaner", siteId: khobar.id, basicSalary: 130000, iqamaExpiry: inDays(300) },
    { name: "Abdul Karim", iqamaNumber: "2412345676", nationality: "Bangladesh", jobTitle: "Mason", siteId: null, basicSalary: 135000, iqamaExpiry: inDays(25) },
  ];
  for (const [i, w] of workers.entries()) {
    await createWorker(ctx, {
      ...w,
      nameAr: null,
      phone: null,
      housingAllowance: 30000,
      transportAllowance: 15000,
      otherAllowance: 0,
      passportNumber: `A0${1234560 + i}`,
      passportExpiry: i === 4 ? inDays(20) : inDays(700),
    });
  }
  console.log("Seeded master data: 2 clients, 3 sites, 6 workers.");

  // Sales: a quotation, a quotation converted to an issued invoice (part paid) and a draft invoice.
  const doc = (clientId: string, siteId: string | null, lines: { description: string; descriptionAr: string | null; quantity: number; unitPrice: number }[]) => ({
    clientId,
    siteId,
    issueDate: null,
    dueDate: null,
    discountType: "NONE" as const,
    discountValue: 0,
    notes: null,
    terms: "Payment within 30 days by bank transfer.",
    lines,
  });
  await createSalesDoc(ctx, "QUOTATION", doc(eastern.id, khobar.id, [{ description: "Cleaners – monthly, 26 days", descriptionAr: "عمال نظافة – شهري، 26 يوماً", quantity: 4 * 26000, unitPrice: 9000 }]));
  const quote = await createSalesDoc(
    ctx,
    "QUOTATION",
    doc(gulf.id, jubail.id, [
      { description: "Electricians – November, 26 days", descriptionAr: "كهربائيون – نوفمبر، 26 يوماً", quantity: 2 * 26000, unitPrice: 15000 },
      { description: "Welder – November, 26 days", descriptionAr: "لحام – نوفمبر، 26 يوماً", quantity: 26000, unitPrice: 17000 },
      { description: "Overtime hours", descriptionAr: "ساعات إضافية", quantity: 37500, unitPrice: 2250 },
    ]),
  );
  const invoice = await convertSalesDoc(ctx, quote.id, "INVOICE");
  await issueInvoice(ctx, invoice.id);
  await addPayment(ctx, invoice.id, { amount: 500000, paidOn: inDays(0), method: "BANK_TRANSFER", reference: "TRX-1001" });
  const credit = await createCreditNote(ctx, invoice.id, {
    ...doc(gulf.id, jubail.id, [{ description: "Welder – 2 days not worked", descriptionAr: "لحام – يومان دون عمل", quantity: 2000, unitPrice: 17000 }]),
    reason: "Welder absent 2 days in November",
  });
  await issueTaxDocument(ctx, credit.id);
  await createSalesDoc(ctx, "INVOICE", doc(gulf.id, dammam.id, [{ description: "Helpers – November", descriptionAr: "عمال – نوفمبر", quantity: 26000, unitPrice: 8000 }]));
  console.log("Seeded sales: 2 quotations, 1 issued invoice (part paid, with a credit note), 1 draft invoice.");
  console.log("Seeded: owner@demo.test / accountant@demo.test (password demo12345)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
