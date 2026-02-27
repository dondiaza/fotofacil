import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { assertSessionStoreAccess, getMediaFileAccess } from "@/lib/media-access";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  fileId: z.string().min(1),
  text: z.string().trim().min(1).max(4000),
  zoneX: z.number().min(0).max(1).optional(),
  zoneY: z.number().min(0).max(1).optional(),
  zoneW: z.number().min(0).max(1).optional(),
  zoneH: z.number().min(0).max(1).optional()
});

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const fileId = String(url.searchParams.get("fileId") || "").trim();
  if (!fileId) {
    return badRequest("fileId es obligatorio");
  }

  const file = await getMediaFileAccess(fileId);
  if (!file) {
    return badRequest("Archivo no encontrado");
  }

  const allowed = await assertSessionStoreAccess(session, file.uploadDay.storeId);
  if (!allowed) {
    return forbidden();
  }

  const threads = await prisma.mediaThread.findMany({
    where: {
      storeId: file.uploadDay.storeId,
      versionGroupId: file.versionGroupId
    },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      messages: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          file: {
            select: {
              id: true,
              versionNumber: true
            }
          }
        }
      },
      reads: {
        where: {
          userId: session.uid
        },
        take: 1
      }
    }
  });

  return Response.json({
    items: threads.map((thread) => {
      const lastReadAt = thread.reads[0]?.lastReadAt || null;
      const unreadCount = thread.messages.filter(
        (msg) => msg.authorUserId !== session.uid && (!lastReadAt || msg.createdAt > lastReadAt)
      ).length;

      return {
        id: thread.id,
        storeId: thread.storeId,
        uploadDayId: thread.uploadDayId,
        rootFileId: thread.rootFileId,
        currentFileId: thread.currentFileId,
        versionGroupId: thread.versionGroupId,
        zoneX: thread.zoneX,
        zoneY: thread.zoneY,
        zoneW: thread.zoneW,
        zoneH: thread.zoneH,
        resolvedAt: thread.resolvedAt,
        updatedAt: thread.updatedAt,
        unreadCount,
        messages: thread.messages.map((message) => ({
          id: message.id,
          fileId: message.fileId,
          fileVersionNumber: message.file?.versionNumber ?? null,
          authorUserId: message.authorUserId,
          authorRole: message.authorRole,
          text: message.text,
          createdAt: message.createdAt
        }))
      };
    })
  });
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const source = await getMediaFileAccess(parsed.data.fileId);
  if (!source) {
    return badRequest("Archivo no encontrado");
  }

  const allowed = await assertSessionStoreAccess(session, source.uploadDay.storeId);
  if (!allowed) {
    return forbidden();
  }

  const created = await prisma.$transaction(async (tx) => {
    const thread = await tx.mediaThread.create({
      data: {
        storeId: source.uploadDay.storeId,
        uploadDayId: source.uploadDayId,
        rootFileId: source.id,
        currentFileId: source.id,
        versionGroupId: source.versionGroupId,
        zoneX: parsed.data.zoneX,
        zoneY: parsed.data.zoneY,
        zoneW: parsed.data.zoneW,
        zoneH: parsed.data.zoneH,
        createdByUserId: session.uid,
        createdByRole: session.role
      }
    });

    const message = await tx.mediaThreadMessage.create({
      data: {
        threadId: thread.id,
        fileId: source.id,
        authorUserId: session.uid,
        authorRole: session.role,
        text: parsed.data.text
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

    return { thread, message };
  });

  await writeAuditLog({
    action: "MEDIA_THREAD_CREATED",
    userId: session.uid,
    storeId: source.uploadDay.storeId,
    payload: {
      fileId: source.id,
      threadId: created.thread.id,
      hasZone:
        parsed.data.zoneX !== undefined &&
        parsed.data.zoneY !== undefined &&
        parsed.data.zoneW !== undefined &&
        parsed.data.zoneH !== undefined
    }
  });

  return Response.json({
    ok: true,
    item: {
      id: created.thread.id,
      fileId: source.id
    }
  });
}
