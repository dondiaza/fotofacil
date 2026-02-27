import { z } from "zod";
import { getDriveFileMeta } from "@/lib/drive";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { verifyJwt } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/request-auth";
import { refreshUploadDayStatus } from "@/lib/store-service";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  finalizeToken: z.string().min(1),
  driveFileId: z.string().min(1)
});

type FinalizePayload = {
  t: string;
  uid: string;
  storeId: string;
  uploadDayId: string;
  folderId: string;
  slotName: string;
  sequence: number;
  finalFilename: string;
  versionGroupId: string;
  versionNumber: number;
  supersedesFileId: string | null;
  mimeType: string;
  bytes: number;
  uploadUrl?: string;
  exp?: number;
};

export async function POST(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
    }

    let token: FinalizePayload;
    try {
      token = await verifyJwt<FinalizePayload>(parsed.data.finalizeToken);
    } catch {
      return badRequest("Token de subida inválido o expirado");
    }

    if (token.t !== "video_upload_finalize") {
      return badRequest("Tipo de token inválido");
    }
    if (token.uid !== auth.session.uid || token.storeId !== auth.store.id) {
      return forbidden();
    }

    const uploadDay = await prisma.uploadDay.findUnique({
      where: { id: token.uploadDayId },
      select: { id: true, storeId: true }
    });
    if (!uploadDay || uploadDay.storeId !== auth.store.id) {
      return badRequest("Jornada de subida inválida");
    }

    const driveMeta = await getDriveFileMeta(parsed.data.driveFileId);
    if (!driveMeta.id) {
      return badRequest("No se pudo verificar el archivo subido");
    }
    if (driveMeta.name && driveMeta.name !== token.finalFilename) {
      return badRequest("Nombre final no coincide con el esperado");
    }
    if (token.folderId && Array.isArray(driveMeta.parents) && !driveMeta.parents.includes(token.folderId)) {
      return badRequest("El archivo no está en la carpeta esperada");
    }

    const existing = await prisma.uploadFile.findFirst({
      where: {
        uploadDayId: token.uploadDayId,
        driveFileId: parsed.data.driveFileId
      }
    });

    const record =
      existing ||
      (await prisma.$transaction(async (tx) => {
        if (token.supersedesFileId) {
          await tx.uploadFile.update({
            where: { id: token.supersedesFileId },
            data: {
              isCurrentVersion: false
            }
          });
        }

        return tx.uploadFile.create({
          data: {
            uploadDayId: token.uploadDayId,
            slotName: token.slotName,
            sequence: token.sequence,
            kind: "VIDEO",
            originalFilename: driveMeta.name || token.finalFilename,
            finalFilename: token.finalFilename,
            driveFileId: parsed.data.driveFileId,
            driveWebViewLink: driveMeta.webViewLink || null,
            mimeType: driveMeta.mimeType || token.mimeType || "video/mp4",
            bytes: Number(driveMeta.size || token.bytes || 0),
            versionGroupId: token.versionGroupId,
            versionNumber: token.versionNumber,
            supersedesFileId: token.supersedesFileId,
            isCurrentVersion: true,
            createdByUserId: auth.session.uid,
            createdByRole: auth.session.role
          }
        });
      }));

    const updatedDay = await refreshUploadDayStatus(token.uploadDayId);
    if (!updatedDay) {
      return badRequest("Could not update upload day");
    }

    if (updatedDay.isSent) {
      await prisma.alert.updateMany({
        where: {
          storeId: auth.store.id,
          date: updatedDay.date,
          type: "MISSING_UPLOAD",
          resolvedAt: null
        },
        data: { resolvedAt: new Date() }
      });
    }

    await writeAuditLog({
      action: updatedDay.isSent ? "UPLOAD_DAY_SENT" : "UPLOAD_FILE",
      storeId: auth.store.id,
      userId: auth.session.uid,
      payload: {
        kind: "VIDEO",
        slotName: token.slotName,
        filename: token.finalFilename,
        status: updatedDay.status,
        isSent: updatedDay.isSent,
        versionGroupId: token.versionGroupId,
        versionNumber: token.versionNumber,
        mode: "resumable"
      }
    });

    return Response.json({
      ok: true,
      status: updatedDay.status,
      isSent: updatedDay.isSent,
      requirementKind: updatedDay.requirementKind,
      file: {
        id: record.id,
        kind: record.kind,
        slotName: record.slotName,
        finalFilename: record.finalFilename,
        driveFileId: record.driveFileId,
        driveWebViewLink: record.driveWebViewLink,
        versionGroupId: record.versionGroupId,
        versionNumber: record.versionNumber
      },
      driveFolderId: updatedDay.driveFolderId
    });
  } catch (error) {
    console.error("[store/upload/video/finalize] error", error);
    return Response.json(
      {
        error: "No se pudo finalizar la subida de vídeo. Inténtalo de nuevo."
      },
      { status: 500 }
    );
  }
}
