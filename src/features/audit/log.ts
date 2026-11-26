import type { Prisma } from "@/generated/prisma/client";
import type { TxClient } from "@/lib/db";

export interface AuditEntry {
  organizationId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes an audit record inside the caller's tenant transaction. Never put
 * sensitive values (passwords, Iqama or passport numbers) in metadata.
 */
export async function writeAudit(tx: TxClient, entry: AuditEntry) {
  await tx.auditLog.create({
    data: {
      organizationId: entry.organizationId,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
    },
  });
}
