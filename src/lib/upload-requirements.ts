import { RequirementKind, UploadKind, UploadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { weekdayIndex } from "@/lib/date";

type FileLite = {
  kind: UploadKind;
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

export function evaluateDaySent(requirement: RequirementKind, files: FileLite[]) {
  const currentFiles = files.filter((file) => file.isCurrentVersion !== false);
  const hasPhoto = currentFiles.some((file) => file.kind === "PHOTO");
  const hasVideo = currentFiles.some((file) => file.kind === "VIDEO");

  if (requirement === "NONE") {
    return {
      isSent: true,
      status: UploadStatus.COMPLETE,
      missingKinds: [] as UploadKind[]
    };
  }

  if (requirement === "PHOTO") {
    return {
      isSent: hasPhoto,
      status: hasPhoto ? UploadStatus.COMPLETE : UploadStatus.PENDING,
      missingKinds: hasPhoto ? ([] as UploadKind[]) : (["PHOTO"] as UploadKind[])
    };
  }

  if (requirement === "VIDEO") {
    return {
      isSent: hasVideo,
      status: hasVideo ? UploadStatus.COMPLETE : UploadStatus.PENDING,
      missingKinds: hasVideo ? ([] as UploadKind[]) : (["VIDEO"] as UploadKind[])
    };
  }

  const isSent = hasPhoto && hasVideo;
  const missingKinds: UploadKind[] = [];
  if (!hasPhoto) {
    missingKinds.push("PHOTO");
  }
  if (!hasVideo) {
    missingKinds.push("VIDEO");
  }

  return {
    isSent,
    status: isSent ? UploadStatus.COMPLETE : UploadStatus.PENDING,
    missingKinds
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
