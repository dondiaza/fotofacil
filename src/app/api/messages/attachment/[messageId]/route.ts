import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { downloadDriveFile } from "@/lib/drive";
import { prisma } from "@/lib/prisma";
import { canSessionAccessStore, requireAuth } from "@/lib/request-auth";

type Context = {
  params: Promise<{ messageId: string }>;
};

export async function GET(_: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { messageId } = await context.params;
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      storeId: true,
      attachmentDriveFileId: true
    }
  });
  if (!message) {
    return badRequest("Mensaje no encontrado");
  }
  if (!message.attachmentDriveFileId) {
    return badRequest("El mensaje no tiene adjunto");
  }

  const allowed = await canSessionAccessStore(session, message.storeId);
  if (!allowed) {
    return forbidden();
  }

  const downloaded = await downloadDriveFile(message.attachmentDriveFileId);
  const body = new Uint8Array(downloaded.buffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": downloaded.mimeType || "application/octet-stream",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=60"
    }
  });
}
