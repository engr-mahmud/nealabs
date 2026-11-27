import { parseDateInput, toDateInput } from "@/lib/parse";
import { todayInRiyadh } from "@/features/master-data/expiry";

export const periodPresets = ["this-month", "last-month", "this-quarter", "this-year", "last-year", "all"] as const;
export type PeriodPreset = (typeof periodPresets)[number];

/** Inclusive date range (UTC-midnight dates, like stored document dates). Null ends mean open. */
export interface Period {
  preset: PeriodPreset | "custom";
  from: Date | null;
  to: Date | null;
}

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

export function presetRange(preset: PeriodPreset, today: Date): Period {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (preset) {
    case "this-month":
      return { preset, from: utc(y, m, 1), to: utc(y, m + 1, 0) };
    case "last-month":
      return { preset, from: utc(y, m - 1, 1), to: utc(y, m, 0) };
    case "this-quarter": {
      const q = Math.floor(m / 3) * 3;
      return { preset, from: utc(y, q, 1), to: utc(y, q + 3, 0) };
    }
    case "this-year":
      return { preset, from: utc(y, 0, 1), to: utc(y, 11, 31) };
    case "last-year":
      return { preset, from: utc(y - 1, 0, 1), to: utc(y - 1, 11, 31) };
    case "all":
      return { preset, from: null, to: null };
  }
}

/**
 * Reads ?period=this-month or ?from=2026-11-01&to=2026-11-30 from the URL.
 * A custom range wins over a preset; a reversed range is swapped. Default: `fallback` preset.
 */
export function parsePeriod(params: { period?: string; from?: string; to?: string }, fallback: PeriodPreset, today: Date = todayInRiyadh()): Period {
  const from = params.from ? parseDateInput(params.from) : null;
  const to = params.to ? parseDateInput(params.to) : null;
  if (from || to) {
    if (from && to && from > to) return { preset: "custom", from: to, to: from };
    return { preset: "custom", from, to };
  }
  const preset = periodPresets.includes(params.period as PeriodPreset) ? (params.period as PeriodPreset) : fallback;
  return presetRange(preset, today);
}

/** URL parameters that reproduce a period (empty for the default preset). */
export function periodParams(period: Period, fallback: PeriodPreset): Record<string, string> {
  if (period.preset === "custom") return { from: toDateInput(period.from), to: toDateInput(period.to) };
  return period.preset === fallback ? {} : { period: period.preset };
}

/** Prisma filter for a date column. */
export function dateFilter(period: Period) {
  if (!period.from && !period.to) return undefined;
  return { ...(period.from ? { gte: period.from } : {}), ...(period.to ? { lte: period.to } : {}) };
}
