import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { cn } from "@/lib/cn";
import { NotFoundError } from "@/lib/errors";
import { formatSar } from "@/lib/money";
import { halalasToInput, toDateInput } from "@/lib/parse";
import { requireOrgPage } from "@/features/organizations/current";
import { can } from "@/features/organizations/permissions";
import { canWriteData } from "@/features/master-data/permissions";
import { param } from "@/features/master-data/list";
import { todayInRiyadh } from "@/features/master-data/expiry";
import { formatPercent, formatQuantity } from "@/features/sales/totals";
import { effectiveMonthDays } from "@/features/payroll/calc";
import { monthLabel } from "@/features/payroll/documents";
import { addMissingAction, deleteSheetAction, refreshDraftAction, removeLineAction, reopenAction } from "@/features/payroll/actions";
import { ApproveForm } from "@/features/payroll/components/approve-form";
import { LineEditor } from "@/features/payroll/components/line-editor";
import { NotesForm } from "@/features/payroll/components/notes-form";
import { getSheet, sheetLabelEn, type SalaryLine } from "@/features/payroll/service";

export const metadata: Metadata = { title: "Salary sheet" };

export default async function SheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { ctx } = await requireOrgPage();
  const sheet = await getSheet(ctx, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [t, tc, te, locale, format] = await Promise.all([getTranslations("payroll"), getTranslations("common"), getTranslations("errors"), getLocale(), getFormatter()]);
  const lang = locale === "ar" ? "ar" : "en";
  const money = (h: number) => formatSar(h, locale);
  const draft = sheet.status === "DRAFT";
  const canWrite = canWriteData(ctx);
  const editable = draft && canWrite;
  const canReopen = !draft && can(ctx.role, "payroll.reopen") && !ctx.access.readOnly;
  const done = param(sp, "done");
  const error = param(sp, "error");
  const q = param(sp, "q").toLowerCase();
  const title = monthLabel(sheet.year, sheet.month, lang);
  const lines = q ? sheet.lines.filter((l) => [l.workerName, l.workerNameAr ?? "", l.iqamaLast4, l.siteName ?? "", l.jobTitle ?? ""].some((v) => v.toLowerCase().includes(q))) : sheet.lines;
  const base = `/api/payroll/${sheet.id}`;
  const days = effectiveMonthDays(sheet, sheet.year, sheet.month);
  const workerName = (l: SalaryLine) => (lang === "ar" && l.workerNameAr ? l.workerNameAr : l.workerName);

  const groups: { site: string; lines: SalaryLine[] }[] = [];
  for (const l of lines) {
    const site = l.siteName ?? t("noSite");
    const last = groups.at(-1);
    if (last && last.site === site) last.lines.push(l);
    else groups.push({ site, lines: [l] });
  }

  const doneMessage: Record<string, string> = {
    imported: t("done.imported", { count: Number(param(sp, "n")) || 0, skipped: Number(param(sp, "skipped")) || 0 }),
    created: t("done.created"),
    reopened: t("done.reopened"),
    refreshed: t("done.refreshed"),
    removed: t("done.removed"),
    added: t("done.added", { count: Number(param(sp, "n")) || 0 }),
  };

  return (
    <div className="space-y-4">
      <Link href="/app/payroll" className="inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900">
        <span aria-hidden className="me-1 rtl:rotate-180">←</span> {t("title")}
      </Link>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{t("sheetTitle", { month: title })}</h1>
            <Badge tone={draft ? "warning" : "success"}>{t(`status.${sheet.status}`)}</Badge>
          </div>
          <p className="mt-1 text-slate-600">
            {sheet.site?.name ?? t("allSites")} · {t("workerCount", { count: sheet.workerCount })}
            {sheet.payDate ? ` · ${t("paidOn", { date: format.dateTime(sheet.payDate, { dateStyle: "medium", timeZone: "UTC" }) })}` : ""}
          </p>
        </div>
        <div className="sm:text-end">
          <p className="text-sm text-slate-600">{t("fields.totalNet")}</p>
          <p className="text-2xl font-semibold text-slate-900 tabular-nums">{money(sheet.totalNet)}</p>
        </div>
      </div>

      {done && doneMessage[done] ? <Alert tone="success">{doneMessage[done]}</Alert> : null}
      {error ? <Alert tone="error">{te.has(error) ? te(error) : te("generic")}</Alert> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {(
          [
            ["gross", sheet.totalGross],
            ["overtimeAndAdditions", sheet.totalOvertime + sheet.totalAdditions],
            ["deductions", sheet.totalDeductions],
            ["net", sheet.totalNet],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-slate-600">{t(`totals.${key}`)}</p>
            <p className={cn("mt-1 text-lg font-semibold tabular-nums", key === "net" ? "text-slate-900" : "text-slate-800")}>
              {key === "deductions" && value > 0 ? "−" : ""}
              {money(value)}
            </p>
          </div>
        ))}
      </div>

      {draft ? (
        editable ? (
          <Card className="space-y-4">
            <div>
              <CardTitle>{t("draftTitle")}</CardTitle>
              <p className="mt-1 text-sm text-slate-600">{t("draftHelp")}</p>
            </div>
            {sheet.workerCount > 0 ? <ApproveForm sheetId={sheet.id} defaultPayDate={toDateInput(todayInRiyadh())} totalLabel={money(sheet.totalNet)} /> : <Alert tone="warning">{te("sheetEmpty")}</Alert>}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <ButtonLink href={`/app/payroll/new?sheet=${sheet.id}`} variant="secondary">
                {t("uploadAgain")}
              </ButtonLink>
              <form action={addMissingAction}>
                <input type="hidden" name="sheetId" value={sheet.id} />
                <Button type="submit" variant="secondary">
                  {t("addMissing")}
                </Button>
              </form>
              <form action={refreshDraftAction}>
                <input type="hidden" name="sheetId" value={sheet.id} />
                <Button type="submit" variant="secondary">
                  {t("refresh")}
                </Button>
              </form>
            </div>
            <p className="text-sm text-slate-500">{t("refreshHelp")}</p>
          </Card>
        ) : (
          <Alert tone="warning">{t("draftReadOnly")}</Alert>
        )
      ) : (
        <Alert tone="success">
          {t("approvedInfo", { date: sheet.approvedAt ? format.dateTime(sheet.approvedAt, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : "" })}{" "}
          <Link href={`/app/finance?${new URLSearchParams({ kind: "EXPENSE", period: "all", q: sheetLabelEn(sheet) }).toString()}`} className="font-medium underline">
            {t("openFinance")}
          </Link>
        </Alert>
      )}

      <Card className="space-y-3">
        <CardTitle className="text-base">{t("downloads")}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <a href={`${base}/xlsx`} className={buttonClass("secondary", "sm")}>
            {t("downloadExcel")}
          </a>
          <a href={`${base}/sheet?lang=en`} className={buttonClass("secondary", "sm")}>
            {t("downloadSheetPdf")} · EN
          </a>
          <a href={`${base}/sheet?lang=ar`} className={buttonClass("secondary", "sm")}>
            {t("downloadSheetPdf")} · AR
          </a>
          <a href={`${base}/payslips?lang=en`} className={buttonClass("secondary", "sm")}>
            {t("downloadPayslips")} · EN
          </a>
          <a href={`${base}/payslips?lang=ar`} className={buttonClass("secondary", "sm")}>
            {t("downloadPayslips")} · AR
          </a>
          <a href={`${base}/sheet?lang=${lang}&view=1`} className={buttonClass("ghost", "sm")}>
            {t("printView")}
          </a>
        </div>
      </Card>

      <section aria-labelledby="lines-title" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="lines-title" className="text-lg font-semibold text-slate-900">
            {t("workersTitle")}
          </h2>
          {sheet.lines.length > 8 || q ? (
            <form method="get" role="search" className="flex gap-2">
              <label className="sr-only" htmlFor="line-q">
                {t("searchWorker")}
              </label>
              <input
                id="line-q"
                name="q"
                type="search"
                defaultValue={param(sp, "q")}
                placeholder={t("searchWorker")}
                className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none sm:w-64"
              />
              <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
                {t("apply")}
              </button>
            </form>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center text-slate-600">{q ? t("noWorkerMatch") : t("noLines")}</p>
        ) : (
          groups.map((g) => (
            <div key={g.site} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm sm:px-5">
                <span className="font-semibold text-slate-800">{g.site}</span>
                <span className="text-slate-600 tabular-nums">
                  {t("workerCount", { count: g.lines.length })} · {money(g.lines.reduce((s, l) => s + l.netPay, 0))}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.lines.map((l) => {
                  const ded = l.absenceDeduction + l.advances + l.deductions;
                  const extra = l.overtimePay + l.additions;
                  return (
                    <li key={l.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{workerName(l)}</p>
                          <p className="truncate text-sm text-slate-500">
                            <span dir="ltr">•••• {l.iqamaLast4}</span>
                            {l.jobTitle ? ` · ${l.jobTitle}` : ""}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t("lineSummary.gross", { amount: money(l.grossSalary) })}
                            {l.absentDays ? ` · ${t("lineSummary.absent", { days: formatQuantity(l.absentDays) })}` : ""}
                            {l.overtimeHours ? ` · ${t("lineSummary.overtime", { hours: formatQuantity(l.overtimeHours) })}` : ""}
                            {extra ? ` · +${money(extra)}` : ""}
                            {ded ? ` · −${money(ded)}` : ""}
                          </p>
                          {l.notes ? <p className="mt-0.5 text-sm text-slate-500">{l.notes}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <p className="font-semibold text-slate-900 tabular-nums">{money(l.netPay)}</p>
                          <a href={`${base}/payslips?lang=${lang}&line=${l.id}`} className="text-sm font-medium text-brand hover:underline">
                            {t("payslip")}
                          </a>
                        </div>
                      </div>
                      {editable ? (
                        <details className="mt-2 group">
                          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
                            {tc("edit")}
                          </summary>
                          <div className="mt-2 space-y-3 rounded-lg border border-slate-200 p-3 sm:p-4">
                            <LineEditor
                              id={l.id}
                              values={{
                                absentDays: l.absentDays ? formatQuantity(l.absentDays) : "",
                                overtimeHours: l.overtimeHours ? formatQuantity(l.overtimeHours) : "",
                                additions: l.additions ? halalasToInput(l.additions) : "",
                                advances: l.advances ? halalasToInput(l.advances) : "",
                                deductions: l.deductions ? halalasToInput(l.deductions) : "",
                                notes: l.notes ?? "",
                              }}
                            />
                            <form action={removeLineAction} className="border-t border-slate-100 pt-3">
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="sheetId" value={sheet.id} />
                              <ConfirmSubmit label={t("removeLine")} confirmText={t("removeLineConfirm")} confirmLabel={t("removeLine")} cancelLabel={tc("cancel")} />
                            </form>
                          </div>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      <Card className="space-y-3">
        <CardTitle className="text-base">{t("rulesTitle")}</CardTitle>
        <p className="text-sm text-slate-700">
          {t("rulesText", {
            days,
            hours: sheet.hoursPerDay,
            otBase: t(`base.${sheet.overtimeBase}`),
            premium: formatPercent(sheet.overtimePremium),
            absenceBase: t(`base.${sheet.absenceBase}`),
          })}
        </p>
        {editable ? <NotesForm sheetId={sheet.id} notes={sheet.notes ?? ""} /> : sheet.notes ? <p className="text-sm text-slate-700">{sheet.notes}</p> : null}
      </Card>

      {editable ? (
        <form action={deleteSheetAction} className="flex justify-end">
          <input type="hidden" name="sheetId" value={sheet.id} />
          <ConfirmSubmit label={t("deleteDraft")} confirmText={t("deleteDraftConfirm")} confirmLabel={t("deleteDraft")} cancelLabel={tc("cancel")} />
        </form>
      ) : null}
      {canReopen ? (
        <Card className="space-y-2">
          <p className="text-sm text-slate-700">{t("reopenHelp")}</p>
          <form action={reopenAction}>
            <input type="hidden" name="sheetId" value={sheet.id} />
            <ConfirmSubmit label={t("reopen")} confirmText={t("reopenConfirm")} confirmLabel={t("reopen")} cancelLabel={tc("cancel")} />
          </form>
        </Card>
      ) : null}
    </div>
  );
}
