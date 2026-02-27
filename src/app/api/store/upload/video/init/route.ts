import { randomUUID } from "node:crypto";
import { z } from "zod";
import { formatDateKey, parseDateKey, toDayStart, todayDateKey } from "@/lib/date";
import { createDriveResumableUploadSession, ensureStructuredUploadFolder } from "@/lib/drive";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/request-auth";
import { getOrCreateUploadDay } from "@/lib/store-service";
import { extFromFilename } from "@/lib/upload";
import { signJwt } from "@/lib/jwt";

const MAX_DAYS_BACK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const payloadSchema = z.object({
  date: z.string().optional(),
  mimeType: z.string().min(1),
  bytes: z.number().int().positive().max(1024 * 1024 * 1024),
  originalFilename: z.string().min(1),
  slotName: z.string().optional(),
  replaceFileId: z.string().optional()
});

function dateIsWithinWindow(day: Date) {
  const today = toDayStart(new Date());
  const diff = Math.floor((today.getTime() - day.getTime()) / MS_PER_DAY);
  return diff >= 0 && diff <= MAX_DAYS_BACK;
}

function normalizeSlotName(raw: string | undefined) {
  const base = String(raw || "").trim().toUpperCase();
  return base ? base.replace(/\s+/g, "_") : "VIDEO";
}

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

    let uploadDate: Date;
    try {
      uploadDate = parseDateKey(parsed.data.date || todayDateKey());
    } catch (error) {
      return badRequest((error as Error).message);
    }

    if (!dateIsWithinWindow(uploadDate)) {
      return badRequest("date must be within the last 7 days");
    }

    const uploadDay = await getOrCreateUploadDay(auth.store.id, auth.store.clusterId ?? null, uploadDate);
    const dateKey = formatDateKey(uploadDate);

    const clusterName = auth.store.cluster?.name || "Sin Cluster";
    const storeLabel = `${auth.store.storeCode} ${auth.store.name}`;
    const folder = await ensureStructuredUploadFolder({
      clusterName,
      storeName: storeLabel,
      date: uploadDate,
      kind: "VIDEO",
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

    let slotName = normalizeSlotName(parsed.data.slotName);
    let sequence = 1;
    let versionGroupId: string = randomUUID();
    let versionNumber = 1;
    let supersedesFileId: string | null = null;

    const replaceFileId = parsed.data.replaceFileId?.trim() || null;
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

    const extension = extFromFilename(parsed.data.originalFilename) || "mp4";
    const sequenceText = String(sequence).padStart(2, "0");
    const finalFilename = `${auth.store.storeCode}_${dateKey}_${slotName}_${sequenceText}.${extension}`;

    const uploadUrl = await createDriveResumableUploadSession({
      parentId: folder.folderId,
      fileName: finalFilename,
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.bytes
    });

    const finalizeToken = await signJwt(
      {
        t: "video_upload_finalize",
        uid: auth.session.uid,
        storeId: auth.store.id,
        uploadDayId: uploadDay.id,
        folderId: folder.folderId,
        slotName,
        sequence,
        finalFilename,
        versionGroupId,
        versionNumber,
        supersedesFileId,
        mimeType: parsed.data.mimeType,
        bytes: parsed.data.bytes,
        uploadUrl
      },
      60 * 30
    );

    return Response.json({
      ok: true,
      finalizeToken,
      finalFilename
    });
  } catch (error) {
    console.error("[store/upload/video/init] error", error);
    return Response.json(
      {
        error: "No se pudo iniciar la subida de vídeo. Revisa la configuración de Drive e inténtalo de nuevo."
      },
      { status: 500 }
    );
  }
}
