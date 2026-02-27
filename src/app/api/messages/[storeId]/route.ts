import { z } from "zod";
import { formatDateKey } from "@/lib/date";
import { ensureChildFolder, ensureStoreFolder, uploadBufferToDrive } from "@/lib/drive";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { notifyAdminByEmail, notifyManyByEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { normalizeImageBuffer, extFromFilename } from "@/lib/upload";
import { writeAuditLog } from "@/lib/audit";

const getQuerySchema = z.object({
  cursor: z.string().optional()
});

const messageBodySchema = z.object({
  text: z.string().max(1200).optional()
});

type Context = {
  params: Promise<{ storeId: string }>;
};

async function canAccessStoreChat(
  session: { role: "STORE" | "CLUSTER" | "SUPERADMIN"; storeId: string | null; clusterId: string | null },
  storeId: string
) {
  if (session.role === "SUPERADMIN") {
    return true;
  }
  if (session.role === "STORE") {
    return session.storeId === storeId;
  }
  if (session.role === "CLUSTER" && session.clusterId) {
    const count = await prisma.store.count({
      where: {
        id: storeId,
        clusterId: session.clusterId
      }
    });
    return count > 0;
  }
  return false;
}

export async function GET(request: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { storeId } = await context.params;
  if (!(await canAccessStoreChat(session, storeId))) {
    return forbidden();
  }

  const url = new URL(request.url);
  const parsed = getQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor") || undefined
  });
  if (!parsed.success) {
    return badRequest("Invalid query");
  }

  const pageSize = 30;
  const messages = await prisma.message.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
    take: pageSize,
    ...(parsed.data.cursor
      ? {
          skip: 1,
          cursor: { id: parsed.data.cursor }
        }
      : {})
  });

  const hasMore = messages.length === pageSize;
  const nextCursor = hasMore ? messages[messages.length - 1]?.id : null;
  const sorted = [...messages].reverse();

  if (session.role === "STORE") {
    await prisma.message.updateMany({
      where: {
        storeId,
        readAt: null,
        NOT: { fromRole: "STORE" }
      },
      data: {
        readAt: new Date()
      }
    });
  } else {
    await prisma.message.updateMany({
      where: {
        storeId,
        fromRole: "STORE",
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });
  }

  return Response.json({
    items: sorted,
    nextCursor
  });
}

export async function POST(request: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { storeId } = await context.params;
  if (!(await canAccessStoreChat(session, storeId))) {
    return forbidden();
  }

  const formData = await request.formData();
  const textValue = String(formData.get("text") || "").trim();
  const bodyParsed = messageBodySchema.safeParse({ text: textValue || undefined });
  if (!bodyParsed.success) {
    return badRequest("Invalid text");
  }

  const attachment = formData.get("attachment");
  if (!bodyParsed.data.text && !(attachment instanceof File)) {
    return badRequest("text or attachment is required");
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: {
      cluster: {
        include: {
          users: {
            where: {
              role: "CLUSTER",
              email: {
                not: null
              }
            },
            select: {
              email: true
            }
          }
        }
      }
    }
  });
  if (!store) {
    return badRequest("Store not found");
  }

  if (session.role === "STORE" && !store.clusterId) {
    return badRequest("Tu tienda no tiene cluster asignado. Contacta con superadmin.");
  }
  if (session.role === "CLUSTER" && session.clusterId !== store.clusterId) {
    return forbidden();
  }

  let attachmentDriveFileId: string | null = null;
  let attachmentWebViewLink: string | null = null;

  if (attachment instanceof File) {
    const storeFolderId = await ensureStoreFolder(store.storeCode, store.driveFolderId);
    if (storeFolderId !== store.driveFolderId) {
      await prisma.store.update({
        where: { id: store.id },
        data: { driveFolderId: storeFolderId }
      });
    }
    const chatFolderId = await ensureChildFolder(storeFolderId, "INCIDENCIAS");

    const buffer = Buffer.from(await attachment.arrayBuffer());
    const normalized = await normalizeImageBuffer(buffer, attachment.type || "application/octet-stream");
    const ext = normalized.extension === "bin" ? extFromFilename(attachment.name) || "bin" : normalized.extension;
    const filename = `${store.storeCode}_${formatDateKey(new Date())}_CHAT_${Date.now()}.${ext}`;

    const uploaded = await uploadBufferToDrive({
      parentId: chatFolderId,
      fileName: filename,
      mimeType: normalized.mimeType,
      data: normalized.buffer
    });
    attachmentDriveFileId = uploaded.id;
    attachmentWebViewLink = uploaded.webViewLink;
  }

  const message = await prisma.message.create({
    data: {
      storeId,
      fromRole: session.role,
      text: bodyParsed.data.text ?? "",
      attachmentDriveFileId,
      attachmentWebViewLink
    }
  });

  if (session.role === "STORE") {
    const clusterEmails = (store.cluster?.users || []).map((user) => user.email).filter((email): email is string => Boolean(email));
    if (clusterEmails.length > 0) {
      await notifyManyByEmail(
        clusterEmails,
        `Nuevo mensaje de tienda ${store.storeCode}`,
        `${store.name} (${store.storeCode}) envió un mensaje en FotoFácil.`
      );
    }
    await notifyAdminByEmail(
      `Nueva incidencia de tienda ${store.storeCode}`,
      `${store.name} (${store.storeCode}) envió un mensaje en FotoFácil.`
    );
  } else if (session.role === "CLUSTER") {
    await notifyAdminByEmail(
      `Cluster escribió sobre tienda ${store.storeCode}`,
      `Un cluster envió un mensaje en la conversación de ${store.name} (${store.storeCode}).`
    );
  }

  await writeAuditLog({
    action: "MESSAGE_SENT",
    userId: session.uid,
    storeId,
    payload: {
      messageId: message.id,
      hasAttachment: Boolean(attachmentDriveFileId),
      fromRole: session.role
    }
  });

  return Response.json({ ok: true, item: message });
}
