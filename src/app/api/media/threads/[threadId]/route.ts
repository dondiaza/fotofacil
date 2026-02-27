import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { assertSessionStoreAccess, getMediaFileAccess, getThreadAccess } from "@/lib/media-access";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  resolved: z.boolean().optional(),
  currentFileId: z.string().optional()
});

type Context = {
  params: Promise<{ threadId: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const { threadId } = await context.params;
  const thread = await getThreadAccess(threadId);
  if (!thread) {
    return badRequest("Hilo no encontrado");
  }

  const allowed = await assertSessionStoreAccess(session, thread.storeId);
  if (!allowed) {
    return forbidden();
  }

  let currentFileId: string | undefined;
  if (parsed.data.currentFileId) {
    const file = await getMediaFileAccess(parsed.data.currentFileId);
    if (!file || file.uploadDay.storeId !== thread.storeId || file.versionGroupId !== thread.versionGroupId) {
      return badRequest("currentFileId no válido para este hilo");
    }
    currentFileId = file.id;
  }

  const updated = await prisma.mediaThread.update({
    where: { id: thread.id },
    data: {
      currentFileId: currentFileId ?? thread.currentFileId,
      resolvedAt:
        parsed.data.resolved === undefined
          ? thread.resolvedAt
          : parsed.data.resolved
            ? new Date()
            : null
    },
    select: {
      id: true,
      currentFileId: true,
      resolvedAt: true,
      updatedAt: true
    }
  });

  await writeAuditLog({
    action: "MEDIA_THREAD_UPDATED",
    userId: session.uid,
    storeId: thread.storeId,
    payload: {
      threadId: thread.id,
      resolved: parsed.data.resolved,
      currentFileId: updated.currentFileId
    }
  });

  return Response.json({ ok: true, item: updated });
}
