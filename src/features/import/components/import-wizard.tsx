"use client";

import Link from "next/link";
import { useActionState, useState, startTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Card, CardTitle } from "@/components/ui/card";
import { FileInput } from "@/components/ui/file-input";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { importAction } from "../actions";
import { COLUMNS, type ImportType } from "../definitions";

/**
 * Template → upload and preview (row-level errors) → import. The same file input
 * is submitted twice: first to check, then to save, so the preview is never trusted.
 */
export function ImportWizard({ type, listPath }: { type: ImportType; listPath: string }) {
  const t = useTranslations("import");
  const locale = useLocale();
  const [state, action, pending] = useActionState(importAction, null);
  const [mode, setMode] = useState<"preview" | "commit">("preview");

  // Submitted by hand (not <form action>) so React does not clear the chosen file
  // after the check: the same file is sent again for the import step.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    setMode(formData.get("mode") === "commit" ? "commit" : "preview");
    startTransition(() => action(formData));
  };
  const columns = COLUMNS[type];
  const stage = state?.stage ?? "upload";

  if (stage === "done" && state) {
    return (
      <Card className="space-y-4">
        <Alert tone="success">
          {t("done", { imported: state.imported ?? 0 })} {state.skipped ? t("doneSkipped", { skipped: state.skipped }) : null}
        </Alert>
        <div className="flex flex-wrap gap-2">
          <Link href={listPath} className={buttonClass("primary", "lg")}>
            {t("viewList")}
          </Link>
          <a href={`${listPath}/import`} className={buttonClass("secondary", "lg")}>
            {t("startOver")}
          </a>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("step1")}</CardTitle>
        <p className="mt-1 mb-4 text-sm text-slate-600">{t("step1Help")}</p>
        <a href={`/api/master-data/${type}/template`} className={buttonClass("secondary")} download>
          {t("template")} (.xlsx)
        </a>
      </Card>

      <form onSubmit={submit} className="space-y-4" noValidate aria-busy={pending}>
        <input type="hidden" name="type" value={type} />
        <Card>
          <CardTitle className="mb-4">{t("step2")}</CardTitle>
          {state?.message ? (
            <Alert tone="error" className="mb-4">
              {state.message}
            </Alert>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <FileInput name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required chooseLabel={t("choose")} noFileLabel={t("noFile")} />
            <Button type="submit" name="mode" value="preview" variant={stage === "preview" ? "secondary" : "primary"} disabled={pending}>
              {pending && mode === "preview" ? t("checking") : t("check")}
            </Button>
          </div>
        </Card>

        {stage === "preview" && state?.rows ? (
          <Card className="space-y-4">
            <Alert tone={state.errorCount ? "warning" : "success"}>
              {t("summary", { valid: state.validCount ?? 0, errors: state.errorCount ?? 0 })} {state.errorCount ? t("fixHint") : null}
            </Alert>
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-start">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-slate-700">{t("row")}</th>
                    <th className="px-3 py-2 text-start font-medium text-slate-700">{t("status")}</th>
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-start font-medium whitespace-nowrap text-slate-700">
                        {locale === "ar" ? c.ar : c.en}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.rows.map((r) => {
                    const bad = Object.keys(r.errors).length > 0;
                    return (
                      <tr key={r.rowNumber} className={bad ? "bg-red-50/60" : undefined}>
                        <td className="px-3 py-2 text-slate-500">{r.rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={cn("font-medium", bad ? "text-red-700" : "text-emerald-700")}>{bad ? t("hasErrors") : t("ok")}</span>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {state.validCount ? (
              <Button type="submit" name="mode" value="commit" size="lg" className="w-full sm:w-auto" disabled={pending}>
                {pending && mode === "commit" ? t("importing") : t("importRows", { count: state.validCount })}
              </Button>
            ) : (
              <p className="text-sm text-slate-700">{t("nothingValid")}</p>
            )}
          </Card>
        ) : null}
      </form>
    </div>
  );
}
