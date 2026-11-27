"use client";

import { useTranslations } from "next-intl";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { voidEntryAction } from "../actions";

/** Void a wrong entry, with an optional reason. Two-step confirmation, no browser dialog. */
export function VoidForm({ id }: { id: string }) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  return (
    <form action={voidEntryAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-slate-800">
          {t("fields.voidReason")} <span className="font-normal text-slate-500">({tc("optional")})</span>
        </span>
        <input
          name="reason"
          maxLength={300}
          placeholder={t("void.reasonPlaceholder")}
          className="block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
      </label>
      <ConfirmSubmit label={t("void.button")} confirmText={t("void.confirm")} confirmLabel={t("void.confirmButton")} cancelLabel={tc("cancel")} />
    </form>
  );
}
