import { randomUUID } from "node:crypto";
import { parseDateKey, toDayStart, todayDateKey, formatDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { requireStore } from "@/lib/request-auth";
import { getOrCreateUploadDay, refreshUploadDayStatus } from "@/lib/store-service";
import { ensureStructuredUploadFolder, isDriveStorageQuotaError, uploadBufferToDrive } from "@/lib/drive";
import { extFromFilename, normalizeImageBuffer } from "@/lib/upload";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { notifyClusterOnOffDateUpload } from "@/lib/offdate-upload";

const MAX_DAYS_BACK = 7;
const MAX_DAYS_FUTURE = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateIsWithinWindow(day: Date) {
  const today = toDayStart(new Date());
  const diff = Math.floor((day.getTime() - today.getTime()) / MS_PER_DAY);
  return diff >= -MAX_DAYS_BACK && diff <= MAX_DAYS_FUTURE;
}

function detectKind(file: File, explicit?: string | null) {
  const normalized = String(explicit || "").trim().toUpperCase();
  if (normalized === "PHOTO" || normalized === "VIDEO") {
    return normalized as "PHOTO" | "VIDEO";
  }
  if ((file.type || "").startsWith("video/")) {
    return "VIDEO";
  }
  return "PHOTO";
}

function normalizeSlotName(raw: string | null, fallback: "PHOTO" | "VIDEO") {
  const base = (raw || "").trim().toUpperCase();
  if (base) {
    return base.replace(/\s+/g, "_");
  }
  return fallback === "VIDEO" ? "VIDEO" : "GENERAL";
}

export async function POST(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  try {
    const formData = await request.formData();
    const rawDate = String(formData.get("date") || todayDateKey());
    const file = formData.get("file");
    const explicitKind = formData.get("kind");
    const rawSlotName = formData.get("slotName");
    const replaceFileId = String(formData.get("replaceFileId") || "").trim() || null;

    if (!(file instanceof File)) {
      return badRequest("file is required");
    }

    let uploadDate: Date;
    try {
      uploadDate = parseDateKey(rawDate);
    } catch (error) {
      return badRequest((error as Error).message);
    }

    if (!dateIsWithinWindow(uploadDate)) {
      return badRequest("date must be within +/-7 days from today");
    }

    const kind = detectKind(file, explicitKind ? String(explicitKind) : null);
    const uploadDay = await getOrCreateUploadDay(auth.store.id, auth.store.clusterId ?? null, uploadDate);
    const dateKey = formatDateKey(uploadDate);

    const clusterName = auth.store.cluster?.name || "Sin Cluster";
    const storeLabel = `${auth.store.storeCode} ${auth.store.name}`;
    const folder = await ensureStructuredUploadFolder({
      clusterName,
      storeName: storeLabel,
      date: uploadDate,
      kind,
      cachedDayFolderId: uploadDay.driveFolderId
    });

    if (auth.store.driveFolderId !== folder.trace.storeFolderId) {
      await prisma.store.update({
        where: { id: auth.store.id },
        data: { driveFolderId: folder.trace.storeFolderId }
      });
    }
    if (uploadDay.driveFolderId !== folder.dayFolderId) {
      await prisma.uploadDay.update({
        where: { id: uploadDay.id },
        data: {
          driveFolderId: folder.dayFolderId,
          driveTrace: folder.trace
        }
      });
    }

    let slotName = normalizeSlotName(rawSlotName ? String(rawSlotName) : null, kind);
    let sequence = 1;
    let versionGroupId: string = randomUUID();
    let versionNumber = 1;
    let supersedesFileId: string | null = null;

    if (replaceFileId) {
      const replaced = await prisma.uploadFile.findUnique({
        where: { id: replaceFileId },
        include: {
          uploadDay: {
            select: {
              storeId: true
            }
          }
        }
      });
      if (!replaced || replaced.uploadDay.storeId !== auth.store.id) {
        return badRequest("replaceFileId inválido");
      }
      versionGroupId = replaced.versionGroupId;
      versionNumber = replaced.versionNumber + 1;
      slotName = replaced.slotName;
      sequence = replaced.sequence;
      supersedesFileId = replaced.id;
    } else {
      const existing = await prisma.uploadFile.count({
        where: {
          uploadDayId: uploadDay.id,
          slotName
        }
      });
      sequence = existing + 1;
    }

    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer: Buffer = Buffer.from(arrayBuffer);

    let uploadBuffer: Buffer = originalBuffer;
    let mimeType = file.type || "application/octet-stream";
    let extension = extFromFilename(file.name) || (kind === "VIDEO" ? "mp4" : "jpg");

    if (kind === "PHOTO") {
      const normalized = await normalizeImageBuffer(originalBuffer, file.type || "application/octet-stream");
      uploadBuffer = normalized.buffer;
      mimeType = normalized.mimeType;
      extension = normalized.extension || "jpg";
    }

    const sequenceText = String(sequence).padStart(2, "0");
    const finalFilename = `${auth.store.storeCode}_${dateKey}_${slotName}_${sequenceText}.${extension}`;

    const uploaded = await uploadBufferToDrive({
      parentId: folder.folderId,
      fileName: finalFilename,
      mimeType,
      data: uploadBuffer
    });

    const record = await prisma.$transaction(async (tx) => {
      if (supersedesFileId) {
        await tx.uploadFile.update({
          where: { id: supersedesFileId },
          data: {
            isCurrentVersion: false
          }
        });
      }

      return tx.uploadFile.create({
        data: {
          uploadDayId: uploadDay.id,
          slotName,
          sequence,
          kind,
          originalFilename: file.name,
          finalFilename,
          driveFileId: uploaded.id,
          driveWebViewLink: uploaded.webViewLink,
          mimeType: uploaded.mimeType,
          bytes: uploadBuffer.byteLength,
          versionGroupId,
          versionNumber,
          supersedesFileId,
          isCurrentVersion: true,
          createdByUserId: auth.session.uid,
          createdByRole: auth.session.role
        }
      });
    });

    const updatedDay = await refreshUploadDayStatus(uploadDay.id);
    if (!updatedDay) {
      return badRequest("Could not update upload day");
    }

    if (updatedDay.isSent) {
      await prisma.alert.updateMany({
        where: {
          storeId: auth.store.id,
          date: uploadDate,
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
        kind,
        slotName,
        date: dateKey,
        filename: finalFilename,
        status: updatedDay.status,
        isSent: updatedDay.isSent,
        versionGroupId,
        versionNumber
      }
    });

    await notifyClusterOnOffDateUpload({
      storeId: auth.store.id,
      storeCode: auth.store.storeCode,
      storeName: auth.store.name,
      clusterId: auth.store.clusterId ?? null,
      uploadDate
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
    const message = error instanceof Error ? error.message : "Unexpected upload error";
    console.error("[store/upload] error", error);

    if (
      message.includes("Drive root folder is not configured") ||
      message.includes("Google Drive service account env vars are missing") ||
      message.includes("Google Drive credentials are missing")
    ) {
      return badRequest("Google Drive no está configurado. Revisa Ajustes > Drive.");
    }

    if (isDriveStorageQuotaError(error)) {
      return badRequest(
        "Google Drive bloquea la subida: la Service Account no tiene cuota en My Drive. Usa una carpeta en Shared Drive o activa impersonación/OAuth."
      );
    }

    return Response.json({ error: "Error interno durante la subida" }, { status: 500 });
  }
}
