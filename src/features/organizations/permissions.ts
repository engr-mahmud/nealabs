import type { Role } from "@/generated/prisma/enums";

/**
 * Role permissions. Owner manages the company, members and billing.
 * Accountant works with business data (clients, invoices, salaries, finance).
 */
const PERMISSIONS = {
  "org.update": ["OWNER"],
  "members.manage": ["OWNER"],
  "billing.manage": ["OWNER"],
  "audit.read": ["OWNER"],
  "data.read": ["OWNER", "ACCOUNTANT"],
  "data.write": ["OWNER", "ACCOUNTANT"],
  "data.export": ["OWNER", "ACCOUNTANT"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/**
 * Allowed even when the organization is read-only: viewing, exporting, and
 * managing billing (so the owner can subscribe again).
 */
const ALLOWED_WHEN_READ_ONLY: ReadonlySet<Permission> = new Set(["data.read", "data.export", "audit.read", "billing.manage"]);

export function isBlockedWhenReadOnly(permission: Permission): boolean {
  return !ALLOWED_WHEN_READ_ONLY.has(permission);
}
