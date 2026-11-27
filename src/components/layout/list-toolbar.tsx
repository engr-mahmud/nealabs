import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

/**
 * Search box plus optional filters, submitted as a plain GET form so lists work
 * without JavaScript and every view has a shareable URL.
 */
export async function ListToolbar({
  basePath,
  q,
  placeholder,
  archived,
  filters,
  hidden,
}: {
  basePath: string;
  q: string;
  placeholder: string;
  archived: boolean;
  filters?: ReactNode;
  hidden?: Record<string, string>;
}) {
  const t = await getTranslations("list");
  const keep = new URLSearchParams(hidden);
  const tab = (isArchived: boolean) => {
    const p = new URLSearchParams(keep);
    if (isArchived) p.set("archived", "1");
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mb-4 space-y-3">
      <form method="get" action={basePath} role="search" className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {archived ? <input type="hidden" name="archived" value="1" /> : null}
        {Object.entries(hidden ?? {}).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="sr-only" htmlFor="list-q">
          {t("search")}
        </label>
        <input
          id="list-q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder={placeholder}
          className="block min-h-11 w-full flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
        {filters}
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
          {t("search")}
        </button>
      </form>
      <div className="flex gap-1 text-sm" role="tablist">
        {[false, true].map((isArchived) => (
          <Link
            key={String(isArchived)}
            href={tab(isArchived)}
            role="tab"
            aria-selected={archived === isArchived}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full px-3 font-medium",
              archived === isArchived ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {isArchived ? t("archived") : t("active")}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function FilterSelect({ name, label, value, children }: { name: string; label: string; value: string; children: ReactNode }) {
  return (
    <>
      <label className="sr-only" htmlFor={`filter-${name}`}>
        {label}
      </label>
      <select
        id={`filter-${name}`}
        name={name}
        defaultValue={value}
        className="block min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none sm:max-w-56"
      >
        {children}
      </select>
    </>
  );
}

export async function Pagination({ basePath, params, page, pageCount, total }: { basePath: string; params: Record<string, string>; page: number; pageCount: number; total: number }) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("list");
  const href = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set("page", String(p));
    else sp.delete("page");
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const link = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50";
  return (
    <nav className="mt-4 flex items-center justify-between gap-2" aria-label={t("pages")}>
      {page > 1 ? (
        <Link className={link} href={href(page - 1)}>
          {t("previous")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-600">{t("pageOf", { page, pageCount, total })}</span>
      {page < pageCount ? (
        <Link className={link} href={href(page + 1)}>
          {t("next")}
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
