import { UploadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sortSlots } from "@/lib/slots";
import { formatDateKey, toDayStart } from "@/lib/date";
import { evaluateDaySent, getRequirementForStoreDate } from "@/lib/upload-requirements";

export async function getEffectiveSlots(storeId: string) {
  const globalSlots = await prisma.slotTemplate.findMany({
    where: { storeId: null },
    select: {
      id: true,
      name: true,
      required: true,
      order: true,
      allowMultiple: true
    }
  });

  if (globalSlots.length > 0) {
    return sortSlots(globalSlots);
  }

  const storeSlots = await prisma.slotTemplate.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      required: true,
      order: true,
      allowMultiple: true
    }
  });

  return sortSlots(storeSlots);
}

export async function getOrCreateUploadDay(storeId: string, clusterId: string | null, date: Date) {
  const dayDate = toDayStart(date);
  const requirementKind = await getRequirementForStoreDate(storeId, clusterId, dayDate);

  const uploadDay = await prisma.uploadDay.upsert({
    where: {
      storeId_date: {
        storeId,
        date: dayDate
      }
    },
    create: {
      storeId,
      date: dayDate,
      requirementKind,
      status: UploadStatus.PENDING,
      isSent: false
    },
    update: {
      requirementKind
    }
  });

  return uploadDay;
}

export async function refreshUploadDayStatus(uploadDayId: string) {
  const uploadDay = await prisma.uploadDay.findUnique({
    where: { id: uploadDayId },
    include: {
      store: {
        select: {
          id: true
        }
      },
      files: {
        select: {
          kind: true,
          slotName: true,
          isCurrentVersion: true
        }
      }
    }
  });

  if (!uploadDay) {
    return null;
  }

  const effectiveSlots = await getEffectiveSlots(uploadDay.store.id);
  const requiredSlotNames = effectiveSlots.filter((slot) => slot.required).map((slot) => slot.name);
  const evalResult = evaluateDaySent(uploadDay.requirementKind, uploadDay.files, requiredSlotNames);
  const completedAt = evalResult.isSent ? uploadDay.completedAt ?? new Date() : null;

  return prisma.uploadDay.update({
    where: { id: uploadDayId },
    data: {
      status: evalResult.status,
      isSent: evalResult.isSent,
      completedAt
    }
  });
}

export async function getStoreDayView(storeId: string, clusterId: string | null, date: Date) {
  const slots = await getEffectiveSlots(storeId);
  const uploadDay = await getOrCreateUploadDay(storeId, clusterId, date);

  const files = await prisma.uploadFile.findMany({
    where: { uploadDayId: uploadDay.id, isCurrentVersion: true },
    orderBy: { createdAt: "desc" }
  });

  const photoBySlot = files.reduce<Record<string, (typeof files)[number][]>>((acc, item) => {
    if (item.kind !== "PHOTO") {
      return acc;
    }
    acc[item.slotName] ??= [];
    acc[item.slotName].push(item);
    return acc;
  }, {});

  const slotChecks = slots.map((slot) => ({
    name: slot.name,
    required: slot.required,
    allowMultiple: slot.allowMultiple,
    order: slot.order,
    done: Boolean(photoBySlot[slot.name]?.length),
    count: photoBySlot[slot.name]?.length ?? 0,
    preview: photoBySlot[slot.name]?.[0]?.driveFileId
      ? `https://drive.google.com/thumbnail?id=${photoBySlot[slot.name][0].driveFileId}`
      : null
  }));

  const requiredSlotNames = slotChecks.filter((slot) => slot.required).map((slot) => slot.name);
  const evalResult = evaluateDaySent(uploadDay.requirementKind, files, requiredSlotNames);
  if (evalResult.status !== uploadDay.status || evalResult.isSent !== uploadDay.isSent) {
    await prisma.uploadDay.update({
      where: { id: uploadDay.id },
      data: {
        status: evalResult.status,
        isSent: evalResult.isSent,
        completedAt: evalResult.isSent ? uploadDay.completedAt ?? new Date() : null
      }
    });
  }

  return {
    date: formatDateKey(uploadDay.date),
    status: evalResult.status,
    isSent: evalResult.isSent,
    requirementKind: uploadDay.requirementKind,
    missingKinds: evalResult.missingKinds,
    missingSlots: evalResult.missingSlots,
    photoCount: files.filter((file) => file.kind === "PHOTO").length,
    videoCount: files.filter((file) => file.kind === "VIDEO").length,
    slots: slotChecks,
    driveFolderId: uploadDay.driveFolderId
  };
}
