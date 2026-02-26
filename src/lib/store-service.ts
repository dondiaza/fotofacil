import { UploadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeDayStatus, sortSlots } from "@/lib/slots";
import { formatDateKey, toDayStart } from "@/lib/date";

export async function getEffectiveSlots(storeId: string) {
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

  if (storeSlots.length > 0) {
    return sortSlots(storeSlots);
  }

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

  return sortSlots(globalSlots);
}

export async function getOrCreateUploadDay(storeId: string, date: Date) {
  const dayDate = toDayStart(date);

  return prisma.uploadDay.upsert({
    where: {
      storeId_date: {
        storeId,
        date: dayDate
      }
    },
    create: {
      storeId,
      date: dayDate,
      status: UploadStatus.PENDING
    },
    update: {}
  });
}

export async function refreshUploadDayStatus(uploadDayId: string, slots: { name: string; required: boolean }[]) {
  const uploadDay = await prisma.uploadDay.findUnique({
    where: { id: uploadDayId },
    include: {
      files: {
        select: {
          slotName: true
        }
      }
    }
  });

  if (!uploadDay) {
    return null;
  }

  const next = computeDayStatus(slots, uploadDay.files);
  const completedAt = next === "COMPLETE" ? uploadDay.completedAt ?? new Date() : null;

  return prisma.uploadDay.update({
    where: { id: uploadDayId },
    data: {
      status: next,
      completedAt
    }
  });
}

export async function getStoreDayView(storeId: string, date: Date) {
  const slots = await getEffectiveSlots(storeId);
  const uploadDay = await getOrCreateUploadDay(storeId, date);

  const files = await prisma.uploadFile.findMany({
    where: { uploadDayId: uploadDay.id },
    orderBy: { createdAt: "desc" }
  });

  const fileBySlot = files.reduce<Record<string, (typeof files)[number][]>>((acc, item) => {
    acc[item.slotName] ??= [];
    acc[item.slotName].push(item);
    return acc;
  }, {});

  const slotChecks = slots.map((slot) => ({
    name: slot.name,
    required: slot.required,
    allowMultiple: slot.allowMultiple,
    order: slot.order,
    done: Boolean(fileBySlot[slot.name]?.length),
    count: fileBySlot[slot.name]?.length ?? 0,
    preview:
      fileBySlot[slot.name]?.[0]?.driveFileId
        ? `https://drive.google.com/thumbnail?id=${fileBySlot[slot.name][0].driveFileId}`
        : null
  }));

  const status = computeDayStatus(slots, files);
  if (status !== uploadDay.status) {
    await prisma.uploadDay.update({
      where: { id: uploadDay.id },
      data: {
        status,
        completedAt: status === "COMPLETE" ? uploadDay.completedAt ?? new Date() : null
      }
    });
  }

  return {
    date: formatDateKey(uploadDay.date),
    status,
    slots: slotChecks,
    driveFolderId: uploadDay.driveFolderId
  };
}
