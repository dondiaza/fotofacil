import { z } from "zod";
import { formatDateKey } from "@/lib/date";
import { ensureChildFolder, ensureStoreFolder, uploadBufferToDrive } from "@/lib/drive";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { notifyAdminByEmail } from "@/lib/notifications";
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

function canAccessStoreChat(
  session: { role: "STORE" | "SUPERADMIN"; storeId: string | null },
  storeId: string
) {
  if (session.role === "SUPERADMIN") {
    return true;
  }
  return session.role === "STORE" && session.storeId === storeId;
}

export async function GET(request: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { storeId } = await context.params;
  if (!canAccessStoreChat(session, storeId)) {
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

  const unreadFilter =
    session.role === "SUPERADMIN"
      ? { storeId, fromRole: "STORE" as const, readAt: null }
      : { storeId, fromRole: "SUPERADMIN" as const, readAt: null };

  await prisma.message.updateMany({
    where: unreadFilter,
    data: {
      readAt: new Date()
    }
  });

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
  if (!canAccessStoreChat(session, storeId)) {
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
    where: { id: storeId }
  });
  if (!store) {
    return badRequest("Store not found");
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
    await notifyAdminByEmail(
      `Nueva incidencia de tienda ${store.storeCode}`,
      `${store.name} (${store.storeCode}) envió un mensaje en FotoFácil.`
    );
  }

  await writeAuditLog({
    action: "MESSAGE_SENT",
    userId: session.uid,
    storeId,
    payload: {
      messageId: message.id,
      hasAttachment: Boolean(attachmentDriveFileId)
    }
  });

  return Response.json({ ok: true, item: message });
}
