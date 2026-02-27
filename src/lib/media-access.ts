import { prisma } from "@/lib/prisma";
import { canSessionAccessStore } from "@/lib/request-auth";
import type { SessionPayload } from "@/lib/session";

export async function assertSessionStoreAccess(session: SessionPayload, storeId: string) {
  const allowed = await canSessionAccessStore(session, storeId);
  return allowed;
}

export async function getMediaFileAccess(fileId: string) {
  return prisma.uploadFile.findUnique({
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
}

export async function getThreadAccess(threadId: string) {
  return prisma.mediaThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      storeId: true,
      versionGroupId: true,
      currentFileId: true,
      resolvedAt: true
    }
  });
}

