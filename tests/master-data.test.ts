import { beforeEach, describe, expect, it } from "vitest";
import { prisma, systemDb, tenantDb } from "@/lib/db";
import { FieldError, NotFoundError, ReadOnlyError } from "@/lib/errors";
import { createClient, getClient, listClients, setClientArchived, updateClient } from "@/features/clients/service";
import { createSite, listSites, updateSite } from "@/features/sites/service";
import {
  createWorker,
  getWorker,
  listExpiringDocuments,
  listWorkers,
  revealWorkerDocument,
  setWorkerArchived,
  updateWorker,
} from "@/features/workforce/service";
import { exportRows } from "@/features/import/export";
import { exportOrganizationData } from "@/features/organizations/service";
import { addMember, clientInput, createOwnerWithOrg, orgWithSite, resetDb, workerInput } from "./helpers";

const DAY = 86_400_000;
const q = { q: "", archived: false, page: 1 };

describe("master data: tenant isolation", () => {
  beforeEach(resetDb);

  it("RLS hides other companies' clients, sites and workers", async () => {
    const a = await orgWithSite("Alpha");
    const b = await orgWithSite("Beta");
    await createWorker(b.ctx, workerInput("Beta Worker", "2400000001", { siteId: b.site.id }));

    expect((await tenantDb(a.org.id).client.findMany()).map((c) => c.id)).toEqual([a.client.id]);
    expect(await tenantDb(a.org.id).site.count()).toBe(1);
    expect(await tenantDb(a.org.id).worker.count()).toBe(0);
    // No tenant set: nothing is visible (fails closed).
    expect(await prisma.worker.count()).toBe(0);
    expect(await systemDb().worker.count()).toBe(1);
  });

  it("services cannot read or change another company's records by id", async () => {
    const a = await orgWithSite("Alpha");
    const b = await orgWithSite("Beta");
    const wb = await createWorker(b.ctx, workerInput("Beta Worker", "2400000001"));

    await expect(getClient(a.ctx, b.client.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateClient(a.ctx, b.client.id, clientInput("Hacked"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(setClientArchived(a.ctx, b.client.id, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateSite(a.ctx, b.site.id, { clientId: a.client.id, name: "x", city: null, address: null, notes: null })).rejects.toBeInstanceOf(NotFoundError);
    await expect(getWorker(a.ctx, wb.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revealWorkerDocument(a.ctx, wb.id, "iqama")).rejects.toBeInstanceOf(NotFoundError);
    await expect(setWorkerArchived(a.ctx, wb.id, true)).rejects.toBeInstanceOf(NotFoundError);

    expect((await getClient(b.ctx, b.client.id)).nameEn).toBe("Beta Client");
    expect((await getWorker(b.ctx, wb.id)).archivedAt).toBeNull();
  });

  it("cannot link a site to another company's client or a worker to another company's site", async () => {
    const a = await orgWithSite("Alpha");
    const b = await orgWithSite("Beta");
    await expect(createSite(a.ctx, { clientId: b.client.id, name: "Sneaky", city: null, address: null, notes: null })).rejects.toMatchObject({ field: "clientId" });
    await expect(createWorker(a.ctx, workerInput("W", "2400000002", { siteId: b.site.id }))).rejects.toMatchObject({ field: "siteId" });
    // Even bypassing the service (system access), the composite foreign key refuses a cross-company link.
    await expect(
      systemDb().site.create({ data: { organizationId: a.org.id, clientId: b.client.id, name: "FK test" } }),
    ).rejects.toThrow();
    await expect(
      systemDb().worker.create({
        data: { organizationId: a.org.id, name: "FK", iqamaEncrypted: "x", iqamaHash: "fk", iqamaLast4: "0000", siteId: b.site.id },
      }),
    ).rejects.toThrow();
  });

  it("RLS rejects inserting a row for another company", async () => {
    const a = await orgWithSite("Alpha");
    const b = await orgWithSite("Beta");
    await expect(tenantDb(a.org.id).client.create({ data: { organizationId: b.org.id, nameEn: "Injected" } })).rejects.toThrow();
  });

  it("the same Iqama can exist in two companies but not twice in one", async () => {
    const a = await orgWithSite("Alpha");
    const b = await orgWithSite("Beta");
    await createWorker(a.ctx, workerInput("One", "2400000003"));
    await createWorker(b.ctx, workerInput("One elsewhere", "2400000003"));
    await expect(createWorker(a.ctx, workerInput("Two", "2400000003"))).rejects.toMatchObject({ field: "iqamaNumber", code: "iqamaTaken" });
  });
});

describe("master data: permissions and read-only", () => {
  beforeEach(resetDb);

  it("accountants can manage master data", async () => {
    const a = await orgWithSite("Alpha");
    const acc = await addMember(a.org.id, "ACCOUNTANT");
    const c = await createClient(acc.ctx, clientInput("By Accountant"));
    expect(c.organizationId).toBe(a.org.id);
  });

  it("a read-only company can view and export but not change anything", async () => {
    const past = new Date(Date.now() - 30 * DAY);
    const { ctx } = await createOwnerWithOrg("Expired", past);
    expect(ctx.access.readOnly).toBe(true);
    await expect(createClient(ctx, clientInput("New"))).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(createWorker(ctx, workerInput("W", "2400000004"))).rejects.toBeInstanceOf(ReadOnlyError);
    expect((await listClients(ctx, q)).total).toBe(0);
    expect(await exportRows(ctx, "workers")).toEqual([]);
  });
});

describe("clients and sites", () => {
  beforeEach(resetDb);

  it("blocks duplicate active client names and archives sites with the client", async () => {
    const a = await orgWithSite("Alpha");
    await expect(createClient(a.ctx, clientInput("alpha client"))).rejects.toBeInstanceOf(FieldError);
    await setClientArchived(a.ctx, a.client.id, true);
    expect((await tenantDb(a.org.id).site.findUniqueOrThrow({ where: { id: a.site.id } })).archivedAt).not.toBeNull();
    // Archived name is free again; restoring the old one is then refused.
    await createClient(a.ctx, clientInput("Alpha Client"));
    await expect(setClientArchived(a.ctx, a.client.id, false)).rejects.toMatchObject({ code: "clientExists" });
    expect((await listClients(a.ctx, { ...q, archived: true })).total).toBe(1);
  });

  it("searches and filters sites", async () => {
    const a = await orgWithSite("Alpha");
    const other = await createClient(a.ctx, clientInput("Other Co", { city: "Jubail" }));
    await createSite(a.ctx, { clientId: other.id, name: "Port Yard", city: "Jubail", address: null, notes: null });
    expect((await listSites(a.ctx, { ...q, q: "port" })).items.map((s) => s.name)).toEqual(["Port Yard"]);
    expect((await listSites(a.ctx, { ...q, clientId: a.client.id })).total).toBe(1);
    expect((await listClients(a.ctx, { ...q, q: "jubail" })).items.map((c) => c.nameEn)).toEqual(["Other Co"]);
    await expect(createSite(a.ctx, { clientId: other.id, name: "port yard", city: null, address: null, notes: null })).rejects.toMatchObject({ code: "siteExists" });
  });
});

describe("workforce", () => {
  beforeEach(resetDb);

  it("stores Iqama and passport encrypted, shows only the last 4, reveals with an audit record", async () => {
    const a = await orgWithSite("Alpha");
    const w = await createWorker(a.ctx, workerInput("Rahim", "2412345678", { passportNumber: "A1234567" }));
    const raw = await tenantDb(a.org.id).worker.findUniqueOrThrow({ where: { id: w.id } });
    expect(JSON.stringify(raw)).not.toContain("2412345678");
    expect(JSON.stringify(raw)).not.toContain("A1234567");

    const view = await getWorker(a.ctx, w.id);
    expect(view).toMatchObject({ iqamaLast4: "5678", passportLast4: "4567" });
    expect(view).not.toHaveProperty("iqamaEncrypted");

    expect(await revealWorkerDocument(a.ctx, w.id, "iqama")).toBe("2412345678");
    expect(await revealWorkerDocument(a.ctx, w.id, "passport")).toBe("A1234567");
    const logs = await tenantDb(a.org.id).auditLog.findMany({ where: { action: "worker.document_viewed" } });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toContain("2412345678");
  });

  it("finds workers by full Iqama, last 4 digits, name and site", async () => {
    const a = await orgWithSite("Alpha");
    await createWorker(a.ctx, workerInput("Rahim Uddin", "2412345678", { siteId: a.site.id }));
    await createWorker(a.ctx, workerInput("Jose Santos", "2499999999"));
    const names = async (extra: object) => (await listWorkers(a.ctx, { ...q, ...extra })).items.map((w) => w.name);
    expect(await names({ q: "2412345678" })).toEqual(["Rahim Uddin"]);
    expect(await names({ q: "9999" })).toEqual(["Jose Santos"]);
    expect(await names({ q: "santos" })).toEqual(["Jose Santos"]);
    expect(await names({ siteId: a.site.id })).toEqual(["Rahim Uddin"]);
    expect(await names({ siteId: "none" })).toEqual(["Jose Santos"]);
  });

  it("keeps the Iqama when the edit form leaves it empty and audits salary changes", async () => {
    const a = await orgWithSite("Alpha");
    const w = await createWorker(a.ctx, workerInput("Rahim", "2412345678", { passportNumber: "A1234567" }));
    const rest = { ...workerInput("Rahim U", "x", { basicSalary: 160000 }) };
    await updateWorker(a.ctx, w.id, { ...rest, iqamaNumber: undefined, passportNumber: null, clearPassport: false });
    expect(await revealWorkerDocument(a.ctx, w.id, "iqama")).toBe("2412345678");
    expect(await revealWorkerDocument(a.ctx, w.id, "passport")).toBe("A1234567");
    const log = await tenantDb(a.org.id).auditLog.findFirstOrThrow({ where: { action: "worker.updated" } });
    expect(log.metadata).toMatchObject({ salary: { basicSalary: { from: 150000, to: 160000 } }, iqamaChanged: false });

    await updateWorker(a.ctx, w.id, { ...rest, iqamaNumber: undefined, passportNumber: null, clearPassport: true });
    expect((await getWorker(a.ctx, w.id)).passportLast4).toBeNull();
  });

  it("lists documents expired or expiring within 30 days, soonest first", async () => {
    const a = await orgWithSite("Alpha");
    const now = new Date("2027-01-10T09:00:00Z");
    const d = (days: number) => new Date(Date.UTC(2027, 0, 10) + days * DAY);
    await createWorker(a.ctx, workerInput("Expired", "2400000011", { iqamaExpiry: d(-2) }));
    await createWorker(a.ctx, workerInput("Soon", "2400000012", { iqamaExpiry: d(10), passportExpiry: d(30) }));
    await createWorker(a.ctx, workerInput("Later", "2400000013", { iqamaExpiry: d(31) }));
    const archived = await createWorker(a.ctx, workerInput("Gone", "2400000014", { iqamaExpiry: d(1) }));
    await setWorkerArchived(a.ctx, archived.id, true);

    const docs = await listExpiringDocuments(a.ctx, now);
    expect(docs.map((x) => `${x.name}:${x.document}`)).toEqual(["Expired:iqama", "Soon:iqama", "Soon:passport"]);
    expect((await listWorkers(a.ctx, { ...q, expiry: "expired" }, now)).items.map((w) => w.name)).toEqual(["Expired"]);
    expect((await listWorkers(a.ctx, { ...q, expiry: "soon" }, now)).total).toBe(2);
  });

  it("full data export includes master data with decrypted numbers and is audited", async () => {
    const a = await orgWithSite("Alpha");
    await createWorker(a.ctx, workerInput("Rahim", "2412345678", { siteId: a.site.id }));
    const data = await exportOrganizationData(a.ctx);
    expect(data.clients).toHaveLength(1);
    expect(data.sites[0]).toMatchObject({ clientName: "Alpha Client", name: "Main Site" });
    expect(data.workers[0]).toMatchObject({ iqamaNumber: "2412345678", basicSalary: "1500", siteName: "Main Site" });
    expect(await tenantDb(a.org.id).auditLog.count({ where: { action: "workers.exported" } })).toBe(1);
  });
});
