import { masterDataConfig } from "@/config/master-data";

export interface ListQuery {
  q: string;
  archived: boolean;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 100) ?? "";
}

/** Reads the common list parameters (?q=&archived=1&page=2) from the URL. */
export function parseListQuery(params: SearchParams): ListQuery {
  const page = Number.parseInt(param(params, "page"), 10);
  return { q: param(params, "q"), archived: param(params, "archived") === "1", page: Number.isFinite(page) && page > 0 ? page : 1 };
}

export function paging(page: number) {
  const take = masterDataConfig.pageSize;
  return { take, skip: (page - 1) * take };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
}

export function paged<T>(items: T[], total: number, page: number): Paged<T> {
  return { items, total, page, pageCount: Math.max(1, Math.ceil(total / masterDataConfig.pageSize)) };
}
