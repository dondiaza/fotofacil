import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { assertSessionStoreAccess, getMediaFileAccess, getThreadAccess } from "@/lib/media-access";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  fileId: z.string().optional()
});

type Context = {
  params: Promise<{ threadId: string }>;
};

export async function POST(request: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
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

  let linkedFileId: string | null = null;
  if (parsed.data.fileId) {
    const linkedFile = await getMediaFileAccess(parsed.data.fileId);
    if (!linkedFile || linkedFile.uploadDay.storeId !== thread.storeId || linkedFile.versionGroupId !== thread.versionGroupId) {
      return badRequest("fileId no válido para este hilo");
    }
    linkedFileId = linkedFile.id;
  }

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.mediaThreadMessage.create({
      data: {
        threadId: thread.id,
        fileId: linkedFileId,
        authorUserId: session.uid,
        authorRole: session.role,
        text: parsed.data.text
      }
    });

    await tx.mediaThread.update({
      where: { id: thread.id },
      data: {
        currentFileId: linkedFileId || thread.currentFileId,
        updatedAt: new Date()
      }
    });

    await tx.mediaThreadRead.upsert({
      where: {
        threadId_userId: {
          threadId: thread.id,
          userId: session.uid
        }
      },
      create: {
        threadId: thread.id,
        userId: session.uid,
        lastReadAt: message.createdAt
      },
      update: {
        lastReadAt: message.createdAt
      }
    });

    return message;
  });

  await writeAuditLog({
    action: "MEDIA_THREAD_MESSAGE_SENT",
    userId: session.uid,
    storeId: thread.storeId,
    payload: {
      threadId: thread.id,
      fileId: linkedFileId
    }
  });

  return Response.json({
    ok: true,
    item: {
      id: created.id,
      threadId: created.threadId,
      fileId: created.fileId,
      authorRole: created.authorRole,
      text: created.text,
      createdAt: created.createdAt
    }
  });
}
