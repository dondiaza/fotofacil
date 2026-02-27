import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { downloadDriveFile } from "@/lib/drive";

type Context = {
  params: Promise<{ fileId: string }>;
};

export async function GET(_: Request, context: Context) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const { fileId } = await context.params;
  const file = await prisma.uploadFile.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      uploadDay: {
        select: {
          storeId: true
        }
      },
      driveFileId: true,
      finalFilename: true,
      mimeType: true
    }
  });

  if (!file) {
    return badRequest("Archivo no encontrado");
  }
  if (!(await canManagerAccessStore(manager, file.uploadDay.storeId))) {
    return forbidden();
  }

  const downloaded = await downloadDriveFile(file.driveFileId);
  const filename = file.finalFilename || downloaded.name || `${file.id}.bin`;
  const body = new Uint8Array(downloaded.buffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType || downloaded.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
