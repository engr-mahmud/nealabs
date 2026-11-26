"use client";

import { useState } from "react";
import { Button } from "./button";

/** Two-step submit for destructive actions: inline confirmation, no browser dialog. */
export function ConfirmSubmit({ label, confirmText, confirmLabel, cancelLabel }: { label: string; confirmText: string; confirmLabel: string; cancelLabel: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      <span className="text-sm text-slate-700">{confirmText}</span>
      <Button type="submit" variant="danger" size="sm">
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        {cancelLabel}
      </Button>
    </div>
  );
}
