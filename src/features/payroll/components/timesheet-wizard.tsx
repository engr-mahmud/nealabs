"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { FileInput } from "@/components/ui/file-input";
import { Button, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatSar } from "@/lib/money";
import { createSheetAction, timesheetAction } from "../actions";
import { TIMESHEET_COLUMNS } from "../timesheet-columns";

interface SiteOption {
  id: string;
  label: string;
}

/**
 * Three steps: download the timesheet (filled with the workers) → upload it and check
 * (row-level errors) → create the draft salary sheet. The same file is sent twice, so the
 * preview is never trusted. With `sheet`, the upload replaces the lines of that draft.
 */
export function TimesheetWizard({ defaultMonth, sites, sheet }: { defaultMonth: string; sites: SiteOption[]; sheet: { id: string; month: string; label: string } | null }) {
  const t = useTranslations("payroll");
  const ti = useTranslations("import");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [state, action, pending] = useActionState(timesheetAction, null);
  const [blankState, blankAction] = useActionState(createSheetAction, null);
  const [mode, setMode] = useState<"preview" | "commit">("preview");
  const [month, setMonth] = useState(sheet?.month ?? defaultMonth);
  const [siteId, setSiteId] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    setMode(formData.get("mode") === "commit" ? "commit" : "preview");
    startTransition(() => action(formData));
  };

  const templateHref = `/api/payroll/template?${new URLSearchParams(sheet ? { month, sheet: sheet.id } : { month, ...(siteId ? { site: siteId } : {}) }).toString()}`;
  const stage = state?.stage ?? "upload";
  const columns = TIMESHEET_COLUMNS.filter((c) => c.kind !== "ref");
  const money = (h: number) => formatSar(h, locale);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("wizard.step1")}</CardTitle>
        {sheet ? (
          <p className="mt-1 mb-4 text-sm text-slate-600">{t("wizard.replaceHelp", { sheet: sheet.label })}</p>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-slate-600">{t("wizard.step1Help")}</p>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="ts-month" className="block text-sm font-medium text-slate-800">
                  {t("fields.month")}
                </label>
                <input
                  id="ts-month"
                  type="month"
                  value={month}
                  required
                  onChange={(e) => setMonth(e.target.value)}
                  className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ts-site" className="block text-sm font-medium text-slate-800">
                  {t("fields.site")} <span className="font-normal text-slate-500">({tc("optional")})</span>
                </label>
                <select
                  id="ts-site"
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
                >
                  <option value="">{t("allSites")}</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
        <a href={templateHref} className={buttonClass("secondary")} download>
          {t("wizard.download")} (.xlsx)
        </a>
      </Card>

      <form onSubmit={submit} className="space-y-4" noValidate aria-busy={pending}>
        {sheet ? <input type="hidden" name="sheetId" value={sheet.id} /> : null}
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="siteId" value={siteId} />
        <Card>
          <CardTitle className="mb-1">{t("wizard.step2")}</CardTitle>
          <p className="mb-4 text-sm text-slate-600">{t("wizard.step2Help")}</p>
          {state?.message ? (
            <Alert tone="error" className="mb-4">
              {state.message}
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <FileInput name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required chooseLabel={ti("choose")} noFileLabel={ti("noFile")} />
            <Button type="submit" name="mode" value="preview" variant={stage === "preview" ? "secondary" : "primary"} disabled={pending}>
              {pending && mode === "preview" ? ti("checking") : ti("check")}
            </Button>
          </div>
        </Card>

        {stage === "preview" && state?.rows ? (
          <Card className="space-y-4">
            <CardTitle>{t("wizard.step3")}</CardTitle>
            <Alert tone={state.errorCount ? "warning" : "success"}>
              {t("wizard.summary", { valid: state.validCount ?? 0, errors: state.errorCount ?? 0 })} {state.validCount ? t("wizard.netTotal", { amount: money(state.totalNet ?? 0) }) : null}{" "}
              {state.errorCount ? t("wizard.fixHint") : null}
            </Alert>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-slate-700">{ti("row")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-700">{ti("status")}</th>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-start font-medium whitespace-nowrap text-slate-700">
                        {locale === "ar" ? c.ar : c.en}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-end font-medium whitespace-nowrap text-slate-700">{t("fields.netPay")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.rows.map((r) => {
                    const bad = Object.keys(r.errors).length > 0;
                    return (
                      <tr key={r.rowNumber} className={bad ? "bg-red-50/60" : undefined}>
                        <td className="px-3 py-2 text-slate-500">{r.rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={cn("font-medium", bad ? "text-red-700" : "text-emerald-700")}>{bad ? ti("hasErrors") : ti("ok")}</span>
                        </td>
                        {columns.map((c) => {
                          const err = r.errors[c.key];
                          return (
                            <td key={c.key} className={cn("px-3 py-2 align-top", err && "bg-red-100")} dir="auto">
                              <span className="whitespace-nowrap">{r.values[c.key]}</span>
                              {err ? <span className="mt-1 block min-w-48 text-xs text-red-800">{err}</span> : null}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-end font-medium whitespace-nowrap tabular-nums">{r.netPay !== null && !bad ? money(r.netPay) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {state.validCount ? (
              <Button type="submit" name="mode" value="commit" size="lg" className="w-full sm:w-auto" disabled={pending}>
                {pending && mode === "commit" ? t("wizard.creating") : sheet ? t("wizard.replace", { count: state.validCount }) : t("wizard.create", { count: state.validCount })}
              </Button>
            ) : (
              <p className="text-sm text-slate-700">{ti("nothingValid")}</p>
            )}
          </Card>
        ) : null}
      </form>

      {!sheet ? (
        <form action={blankAction} className="rounded-xl border border-dashed border-slate-300 bg-white p-5 sm:p-6">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="siteId" value={siteId} />
          <p className="font-medium text-slate-900">{t("wizard.noExcelTitle")}</p>
          <p className="mt-1 mb-4 text-sm text-slate-600">{t("wizard.noExcelHelp")}</p>
          {blankState?.message ? (
            <Alert tone="error" className="mb-4">
              {blankState.message}
            </Alert>
          ) : null}
          <SubmitButton variant="secondary" pendingLabel={t("wizard.creating")}>
            {t("wizard.noExcelButton")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
