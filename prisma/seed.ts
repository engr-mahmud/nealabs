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
import { addPayment, convertSalesDoc, createCreditNote, createSalesDoc, getSalesDoc, issueInvoice, issueTaxDocument } from "../src/features/sales/service";
import { createEntry, listCategories } from "../src/features/finance/service";
import { createWorker } from "../src/features/workforce/service";
import { todayInRiyadh } from "../src/features/master-data/expiry";
import { approveSheet, createSheetForActiveWorkers, getSheet, markPaid, updateLine } from "../src/features/payroll/service";

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

  // Finance: a fully paid invoice for Khobar Mall (its payment becomes income) and expenses per site.
  const khobarInvoice = await createSalesDoc(ctx, "INVOICE", doc(eastern.id, khobar.id, [{ description: "Cleaners – October, 26 days", descriptionAr: "عمال نظافة – أكتوبر، 26 يوماً", quantity: 4 * 26000, unitPrice: 9000 }]));
  const issuedKhobar = await issueInvoice(ctx, khobarInvoice.id);
  const khobarTotal = (await getSalesDoc(ctx, issuedKhobar.id)).total;
  await addPayment(ctx, khobarInvoice.id, { amount: khobarTotal, paidOn: inDays(-2), method: "BANK_TRANSFER", reference: "TRX-0998" });
  const categories = await listCategories(ctx);
  const cat = (key: string) => categories.find((c) => c.systemKey === key)!.id;
  const expense = (key: string, amount: number, siteId: string | null, description: string, includesVat = false, daysAgo = 1) =>
    createEntry(ctx, { kind: "EXPENSE", categoryId: cat(key), amount, includesVat, date: inDays(-daysAgo), method: "BANK_TRANSFER", siteId, description, reference: null });
  await expense("accommodation", 345000, jubail.id, "Camp rent", true, 3);
  await expense("transport", 86250, dammam.id, "Bus hire", true, 4);
  await expense("food", 120000, khobar.id, "Meals for cleaners", false, 2);
  await expense("rent", 575000, null, "Office rent", true, 5);
  await expense("government_fees", 65000, null, "Iqama renewal – Imran Khan", false, 6);
  console.log("Seeded finance: 1 paid invoice, 5 expenses.");

  // Salaries: last month's sheet, approved (its net pay becomes "Salaries" expenses per site).
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const sheetId = await createSheetForActiveWorkers(ctx, { year: last.getUTCFullYear(), month: last.getUTCMonth() + 1, siteId: null });
  const lines = (await getSheet(ctx, sheetId)).lines;
  const none = { absentDays: 0, overtimeHours: 0, additions: 0, advances: 0, deductions: 0, notes: null };
  if (lines[0]) await updateLine(ctx, lines[0].id, { ...none, overtimeHours: 24000, advances: 30000 });
  if (lines[1]) await updateLine(ctx, lines[1].id, { ...none, absentDays: 2000 });
  if (lines[2]) await updateLine(ctx, lines[2].id, { ...none, overtimeHours: 12500, additions: 20000, notes: "Good work bonus" });
  await approveSheet(ctx, sheetId, inDays(-1));
  // Everyone paid except one worker, so "unpaid salaries" has something to show.
  for (const line of lines.slice(0, -1)) await markPaid(ctx, sheetId, inDays(-1), line.id);
  console.log("Seeded payroll: last month's salary sheet, approved, all but one worker paid.");
  console.log("Seeded: owner@demo.test / accountant@demo.test (password demo12345)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
