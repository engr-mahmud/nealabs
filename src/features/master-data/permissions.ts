import type { OrgContext } from "@/features/organizations/context";
import { can } from "@/features/organizations/permissions";

/** Whether pages should offer add/edit/import (false for read-only companies). */
export function canWriteData(ctx: OrgContext): boolean {
  return can(ctx.role, "data.write") && !ctx.access.readOnly;
}
