import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { deleteDriveFile } from "@/lib/drive";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { refreshUploadDayStatus } from "@/lib/store-service";
import { writeAuditLog } from "@/lib/audit";

type Context = {
  params: Promise<{ fileId: string }>;
};

export async function DELETE(_: Request, context: Context) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const { fileId } = await context.params;
  const file = await prisma.uploadFile.findUnique({
    where: { id: fileId },
    include: {
      uploadDay: {
        select: {
          id: true,
          storeId: true
        }
      }
    }
  });
  if (!file) {
    return badRequest("Archivo no encontrado");
  }
  if (!(await canManagerAccessStore(manager, file.uploadDay.storeId))) {
    return forbidden();
  }

  let promotedFileId: string | null = null;
  await prisma.$transaction(async (tx) => {
    if (file.isCurrentVersion) {
      const fallback = await tx.uploadFile.findFirst({
        where: {
          uploadDayId: file.uploadDayId,
          versionGroupId: file.versionGroupId,
          id: {
            not: file.id
          }
        },
        orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
        select: {
          id: true
        }
      });
      if (fallback) {
        promotedFileId = fallback.id;
        await tx.uploadFile.update({
          where: { id: fallback.id },
          data: {
            isCurrentVersion: true
          }
        });
      }
    }

    await tx.mediaThread.updateMany({
      where: {
        currentFileId: file.id
      },
      data: {
        currentFileId: promotedFileId
      }
    });

    await tx.uploadFile.delete({
      where: {
        id: file.id
      }
    });
  });

  await refreshUploadDayStatus(file.uploadDay.id);

  try {
    await deleteDriveFile(file.driveFileId);
  } catch (error) {
    console.error("[media/file/delete] drive delete failed", error);
  }

  await writeAuditLog({
    action: "MEDIA_FILE_DELETED",
    userId: manager.session.uid,
    storeId: file.uploadDay.storeId,
    payload: {
      fileId: file.id,
      uploadDayId: file.uploadDay.id,
      promotedFileId
    }
  });

  return Response.json({ ok: true });
}
