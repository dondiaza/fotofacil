import { parseDateKey, toDayStart, todayDateKey, formatDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { requireStore } from "@/lib/request-auth";
import { getEffectiveSlots, getOrCreateUploadDay, refreshUploadDayStatus } from "@/lib/store-service";
import { ensureDateFolder, ensureStoreFolder, uploadBufferToDrive } from "@/lib/drive";
import { normalizeImageBuffer } from "@/lib/upload";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

const MAX_DAYS_BACK = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function dateIsWithinWindow(day: Date) {
  const today = toDayStart(new Date());
  const diff = Math.floor((today.getTime() - day.getTime()) / MS_PER_DAY);
  return diff >= 0 && diff <= MAX_DAYS_BACK;
}

export async function POST(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  const formData = await request.formData();
  const rawDate = String(formData.get("date") || todayDateKey());
  const slotName = String(formData.get("slotName") || "").trim();
  const file = formData.get("file");

  if (!slotName) {
    return badRequest("slotName is required");
  }
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
    return badRequest("date must be within the last 7 days");
  }

  const slots = await getEffectiveSlots(auth.store.id);
  const slot = slots.find((s) => s.name === slotName);
  if (!slot) {
    return badRequest(`slot '${slotName}' is not configured`);
  }

  const uploadDay = await getOrCreateUploadDay(auth.store.id, uploadDate);
  const dateKey = formatDateKey(uploadDate);

  const storeFolderId = await ensureStoreFolder(auth.store.storeCode, auth.store.driveFolderId);
  if (storeFolderId !== auth.store.driveFolderId) {
    await prisma.store.update({
      where: { id: auth.store.id },
      data: { driveFolderId: storeFolderId }
    });
  }

  const dayFolderId = await ensureDateFolder(storeFolderId, dateKey, uploadDay.driveFolderId);
  if (dayFolderId !== uploadDay.driveFolderId) {
    await prisma.uploadDay.update({
      where: { id: uploadDay.id },
      data: { driveFolderId: dayFolderId }
    });
  }

  const existing = await prisma.uploadFile.count({
    where: {
      uploadDayId: uploadDay.id,
      slotName
    }
  });
  const sequence = slot.allowMultiple ? existing + 1 : 1;

  const arrayBuffer = await file.arrayBuffer();
  const normalized = await normalizeImageBuffer(Buffer.from(arrayBuffer), file.type || "application/octet-stream");
  const extension = normalized.extension || "jpg";
  const sequenceText = String(sequence).padStart(2, "0");
  const finalFilename = `${auth.store.storeCode}_${dateKey}_${slotName}_${sequenceText}.${extension}`;

  const uploaded = await uploadBufferToDrive({
    parentId: dayFolderId,
    fileName: finalFilename,
    mimeType: normalized.mimeType,
    data: normalized.buffer
  });

  const record = await prisma.uploadFile.create({
    data: {
      uploadDayId: uploadDay.id,
      slotName,
      sequence,
      originalFilename: file.name,
      finalFilename,
      driveFileId: uploaded.id,
      driveWebViewLink: uploaded.webViewLink,
      mimeType: uploaded.mimeType,
      bytes: normalized.buffer.byteLength
    }
  });

  const updatedDay = await refreshUploadDayStatus(uploadDay.id, slots);
  if (!updatedDay) {
    return badRequest("Could not update upload day");
  }

  if (updatedDay.status === "COMPLETE") {
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
    action: updatedDay.status === "COMPLETE" ? "UPLOAD_COMPLETED" : "UPLOAD_FILE",
    storeId: auth.store.id,
    userId: auth.session.uid,
    payload: {
      slotName,
      date: dateKey,
      filename: finalFilename,
      status: updatedDay.status
    }
  });

  return Response.json({
    ok: true,
    status: updatedDay.status,
    file: {
      id: record.id,
      slotName: record.slotName,
      finalFilename: record.finalFilename,
      driveFileId: record.driveFileId,
      driveWebViewLink: record.driveWebViewLink
    },
    driveFolderId: dayFolderId
  });
}
