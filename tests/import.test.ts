import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { tenantDb } from "@/lib/db";
import { COLUMNS, type ImportType } from "@/features/import/definitions";
import { buildWorkbook, readSheet } from "@/features/import/excel";
import { exportRows } from "@/features/import/export";
import { commitImport, previewImport } from "@/features/import/service";
import { createWorker, revealWorkerDocument } from "@/features/workforce/service";
import { createOwnerWithOrg, orgWithSite, resetDb, workerInput } from "./helpers";

/** Builds an .xlsx in memory with the given header labels and rows. */
async function xlsx(headers: string[], rows: (string | number | Date)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const en = (type: ImportType, keys: string[]) => keys.map((k) => COLUMNS[type].find((c) => c.key === k)!.en);

describe("Excel import", () => {
  beforeEach(resetDb);

  it("template has the right headers and reads back as empty", async () => {
    const bytes = await buildWorkbook("workers", "template", "en");
    await expect(readSheet("workers", bytes)).rejects.toMatchObject({ code: "importEmpty" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const headers = (wb.worksheets[0]!.getRow(1).values as string[]).slice(1);
    expect(headers).toEqual(COLUMNS.workers.map((c) => c.en));
    expect(wb.worksheets).toHaveLength(2); // data + instructions
  });

  it("rejects non-Excel files and files without required columns", async () => {
    await expect(readSheet("clients", new TextEncoder().encode("name,vat\nA,1"))).rejects.toMatchObject({ code: "importNotExcel" });
    await expect(readSheet("clients", await xlsx(["Something else"], [["x"]]))).rejects.toMatchObject({ code: "importMissingColumns" });
  });

  it("matches Arabic headers in any column order", async () => {
    const rows = await readSheet("clients", await xlsx(["المدينة", "اسم العميل (إنجليزي)"], [["Dammam", "Gulf Co"]]));
    expect(rows[0]).toMatchObject({ rowNumber: 2, values: { city: "Dammam", nameEn: "Gulf Co" } });
  });

  it("previews row errors, then imports only the valid client rows", async () => {
    const { ctx, org } = await createOwnerWithOrg("Alpha");
    const bytes = await xlsx(en("clients", ["nameEn", "vatNumber", "city"]), [
      ["Gulf Co", "300000000000003", "Dammam"],
      ["Bad VAT Co", "12345", ""],
      ["gulf co", "", ""],
      ["", "", "Jubail"],
      ["Eastern Co", 300000000000003, "Khobar"],
    ]);
    const sheet = await readSheet("clients", bytes);
    const preview = await previewImport(ctx, "clients", sheet);
    expect(preview.validCount).toBe(2);
    expect(preview.rows.map((r) => r.errors)).toEqual([{}, { vatNumber: "invalidVat" }, { nameEn: "duplicateInFile" }, { nameEn: "required" }, {}]);
    expect(await tenantDb(org.id).client.count()).toBe(0); // preview saves nothing

    expect(await commitImport(ctx, "clients", sheet)).toEqual({ imported: 2, skipped: 3 });
    expect((await tenantDb(org.id).client.findMany({ orderBy: { nameEn: "asc" } })).map((c) => c.nameEn)).toEqual(["Eastern Co", "Gulf Co"]);
    // Importing the same file again finds the existing clients.
    expect((await previewImport(ctx, "clients", sheet)).rows[0]!.errors).toEqual({ nameEn: "clientExists" });
    expect(await tenantDb(org.id).auditLog.count({ where: { action: "clients.imported" } })).toBe(1);
  });

  it("imports sites matched to clients by English or Arabic name", async () => {
    const a = await orgWithSite("Alpha");
    await tenantDb(a.org.id).client.update({ where: { id: a.client.id }, data: { nameAr: "عميل ألفا" } });
    const sheet = await readSheet("sites", await xlsx(en("sites", ["clientName", "name"]), [["alpha client", "Yard 2"], ["عميل ألفا", "Yard 3"], ["Unknown Co", "Yard 4"], ["Alpha Client", "main site"]]));
    const preview = await previewImport(a.ctx, "sites", sheet);
    expect(preview.rows.map((r) => r.errors)).toEqual([{}, {}, { clientName: "clientNotFound" }, { name: "siteExists" }]);
    expect(await commitImport(a.ctx, "sites", sheet)).toEqual({ imported: 2, skipped: 2 });
    expect(await tenantDb(a.org.id).site.count({ where: { clientId: a.client.id } })).toBe(3);
  });

  it("imports workers with encrypted numbers, Excel dates, amounts and site lookup", async () => {
    const a = await orgWithSite("Alpha");
    await createWorker(a.ctx, workerInput("Existing", "2400000099"));
    const headers = en("workers", ["name", "iqamaNumber", "basicSalary", "housingAllowance", "siteName", "iqamaExpiry", "passportNumber"]);
    const sheet = await readSheet(
      "workers",
      await xlsx(headers, [
        ["Rahim", 2412345678, 1500.5, "300", "Main Site", new Date(Date.UTC(2027, 2, 15)), "a1234567"],
        ["Bad Iqama", "12345", "1500", "", "", "", ""],
        ["Dup in file", "2412345678", "1000", "", "", "", ""],
        ["Existing again", "2400000099", "1000", "", "", "", ""],
        ["No site", "2412345679", "1,200", "", "Nowhere", "15/04/2027", ""],
      ]),
    );
    const preview = await previewImport(a.ctx, "workers", sheet);
    expect(preview.rows.map((r) => r.errors)).toEqual([
      {},
      { iqamaNumber: "invalidIqama" },
      { iqamaNumber: "duplicateInFile" },
      { iqamaNumber: "iqamaTaken" },
      { siteName: "siteNotFound" },
    ]);
    // The preview sent to the browser is masked.
    expect(preview.rows[0]!.values.iqamaNumber).toBe("•••• 5678");
    expect(preview.rows[0]!.values.passportNumber).toBe("•••• 4567");

    expect(await commitImport(a.ctx, "workers", sheet)).toEqual({ imported: 1, skipped: 4 });
    const w = await tenantDb(a.org.id).worker.findFirstOrThrow({ where: { name: "Rahim" } });
    expect(w).toMatchObject({ basicSalary: 150050, housingAllowance: 30000, siteId: a.site.id, iqamaLast4: "5678" });
    expect(w.iqamaExpiry?.toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(await revealWorkerDocument(a.ctx, w.id, "passport")).toBe("A1234567");
  });

  it("an exported workforce file can be read back with the same values", async () => {
    const a = await orgWithSite("Alpha");
    await createWorker(a.ctx, workerInput("Rahim", "2412345678", { siteId: a.site.id, basicSalary: 150050, iqamaExpiry: new Date(Date.UTC(2027, 2, 15)) }));
    const rows = await exportRows(a.ctx, "workers", false);
    const sheet = await readSheet("workers", await buildWorkbook("workers", rows, "ar"));
    expect(sheet[0]!.values).toMatchObject({ name: "Rahim", iqamaNumber: "2412345678", basicSalary: "1500.50", siteName: "Main Site", clientName: "Alpha Client", iqamaExpiry: "2027-03-15" });
    // Re-importing the same people is caught as duplicates.
    expect((await previewImport(a.ctx, "workers", sheet)).rows[0]!.errors).toEqual({ iqamaNumber: "iqamaTaken" });
  });
});
