import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <Card className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-slate-600">{subtitle}</p> : null}
        </div>
        {children}
      </Card>
      {footer ? <div className="mt-6 text-center text-sm text-slate-600">{footer}</div> : null}
    </>
  );
}
