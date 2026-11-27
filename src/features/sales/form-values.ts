import { halalasToInput, toDateInput } from "@/lib/parse";
import type { SalesDocValues } from "./components/sales-doc-form";
import type { SalesDocDetail } from "./service";
import { formatPercent, formatQuantity } from "./totals";

/** Plain string values for the document form (safe to pass to a client component). */
export function salesDocFormValues(doc: SalesDocDetail): SalesDocValues {
  return {
    clientId: doc.clientId,
    siteId: doc.siteId ?? "",
    issueDate: toDateInput(doc.issueDate),
    dueDate: toDateInput(doc.dueDate),
    discountType: doc.discountType,
    discountValue: doc.discountType === "PERCENT" ? formatPercent(doc.discountValue) : doc.discountType === "AMOUNT" ? halalasToInput(doc.discountValue) : "",
    notes: doc.notes ?? "",
    terms: doc.terms ?? "",
    lines: doc.lines.map((l) => ({
      description: l.description,
      descriptionAr: l.descriptionAr ?? "",
      quantity: formatQuantity(l.quantity),
      unitPrice: halalasToInput(l.unitPrice),
    })),
  };
}
