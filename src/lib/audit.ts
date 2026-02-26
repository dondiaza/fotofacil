import { prisma } from "@/lib/prisma";

export async function writeAuditLog(params: {
  action: string;
  storeId?: string | null;
  userId?: string | null;
  payload?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      action: params.action,
      storeId: params.storeId ?? null,
      userId: params.userId ?? null,
      payload: params.payload === undefined ? undefined : (params.payload as object)
    }
  });
}
