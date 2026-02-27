import { RequirementKind, UploadKind, UploadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { weekdayIndex } from "@/lib/date";

type FileLite = {
  kind: UploadKind;
  slotName?: string;
  isCurrentVersion?: boolean;
};

export async function getRequirementForStoreDate(storeId: string, clusterId: string | null, date: Date) {
  const weekday = weekdayIndex(date);

  const storeRule = await prisma.uploadRule.findFirst({
    where: {
      storeId,
      weekday
    },
    select: {
      requirement: true
    }
  });
  if (storeRule) {
    return storeRule.requirement;
  }

  if (clusterId) {
    const clusterRule = await prisma.uploadRule.findFirst({
      where: {
        clusterId,
        weekday
      },
      select: {
        requirement: true
      }
    });
    if (clusterRule) {
      return clusterRule.requirement;
    }
  }

  const globalRule = await prisma.uploadRule.findFirst({
    where: {
      storeId: null,
      clusterId: null,
      weekday
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      requirement: true
    }
  });

  return globalRule?.requirement ?? RequirementKind.NONE;
}

export function evaluateDaySent(requirement: RequirementKind, files: FileLite[], requiredSlotNames: string[] = []) {
  const currentFiles = files.filter((file) => file.isCurrentVersion !== false);
  const hasPhoto = currentFiles.some((file) => file.kind === "PHOTO");
  const hasVideo = currentFiles.some((file) => file.kind === "VIDEO");
  const hasAny = currentFiles.length > 0;
  const normalizedRequiredSlots = [...new Set(requiredSlotNames.map((name) => String(name || "").trim().toUpperCase()).filter(Boolean))];
  const photoSlotSet = new Set(
    currentFiles
      .filter((file) => file.kind === "PHOTO")
      .map((file) => String(file.slotName || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const requiredSlotsTotal = normalizedRequiredSlots.length;
  const coveredRequiredSlots = normalizedRequiredSlots.filter((slotName) => photoSlotSet.has(slotName)).length;
  const missingSlots = normalizedRequiredSlots.filter((slotName) => !photoSlotSet.has(slotName));
  const hasAllRequiredPhotoSlots = requiredSlotsTotal === 0 ? hasPhoto : coveredRequiredSlots >= requiredSlotsTotal;
  const partialPhotoSlots = coveredRequiredSlots > 0 || hasPhoto;

  if (requirement === "NONE") {
    return {
      isSent: true,
      status: UploadStatus.COMPLETE,
      missingKinds: [] as UploadKind[],
      requiredSlotsTotal,
      coveredRequiredSlots,
      missingSlots: [] as string[]
    };
  }

  if (requirement === "PHOTO") {
    const isSent = hasAllRequiredPhotoSlots;
    const status = isSent ? UploadStatus.COMPLETE : partialPhotoSlots || hasPhoto ? UploadStatus.PARTIAL : UploadStatus.PENDING;
    return {
      isSent,
      status,
      missingKinds: isSent ? ([] as UploadKind[]) : (["PHOTO"] as UploadKind[]),
      requiredSlotsTotal,
      coveredRequiredSlots,
      missingSlots
    };
  }

  if (requirement === "VIDEO") {
    const isSent = hasVideo;
    return {
      isSent,
      status: isSent ? UploadStatus.COMPLETE : hasAny ? UploadStatus.PARTIAL : UploadStatus.PENDING,
      missingKinds: isSent ? ([] as UploadKind[]) : (["VIDEO"] as UploadKind[]),
      requiredSlotsTotal,
      coveredRequiredSlots,
      missingSlots: [] as string[]
    };
  }

  const isSent = hasAllRequiredPhotoSlots && hasVideo;
  const missingKinds: UploadKind[] = [];
  if (!hasAllRequiredPhotoSlots) {
    missingKinds.push("PHOTO");
  }
  if (!hasVideo) {
    missingKinds.push("VIDEO");
  }

  return {
    isSent,
    status: isSent ? UploadStatus.COMPLETE : hasAny || partialPhotoSlots ? UploadStatus.PARTIAL : UploadStatus.PENDING,
    missingKinds,
    requiredSlotsTotal,
    coveredRequiredSlots,
    missingSlots
  };
}

export function requirementToHuman(kind: RequirementKind) {
  if (kind === "PHOTO") {
    return "Foto";
  }
  if (kind === "VIDEO") {
    return "Video";
  }
  if (kind === "BOTH") {
    return "Foto + Video";
  }
  return "Sin requerimiento";
}
