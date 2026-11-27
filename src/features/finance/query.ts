import { param } from "@/features/master-data/list";
import { parsePeriod, periodParams, type PeriodPreset } from "./period";
import type { EntryQuery } from "./service";

/** The finance list opens on this month. */
export const LIST_DEFAULT_PERIOD: PeriodPreset = "this-month";

type SearchParams = Record<string, string | string[] | undefined>;

/** Reads the finance list filters from the URL (shared by the list page and the Excel export). */
export function parseEntryQuery(sp: SearchParams): EntryQuery {
  const kind = param(sp, "kind");
  const page = Number.parseInt(param(sp, "page"), 10);
  return {
    kind: kind === "INCOME" || kind === "EXPENSE" ? kind : "",
    categoryId: param(sp, "category"),
    siteId: param(sp, "site"),
    q: param(sp, "q"),
    voided: param(sp, "voided") === "1",
    period: parsePeriod({ period: param(sp, "period"), from: param(sp, "from"), to: param(sp, "to") }, LIST_DEFAULT_PERIOD),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL parameters that reproduce the filters (without the page number). */
export function entryQueryParams(q: EntryQuery): Record<string, string> {
  return Object.fromEntries(
    Object.entries({ kind: q.kind, category: q.categoryId, site: q.siteId, q: q.q, voided: q.voided ? "1" : "", ...periodParams(q.period, LIST_DEFAULT_PERIOD) }).filter(([, v]) => v),
  );
}
