import { formatDateKey, parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager, storeScopeWhere } from "@/lib/request-auth";

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || todayDateKey();
  const selectedStoreIdRaw = url.searchParams.get("storeId");

  let day: Date;
  try {
    day = parseDateKey(dateParam);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...storeScopeWhere(manager)
    },
    orderBy: { storeCode: "asc" },
    select: {
      id: true,
      name: true,
      storeCode: true,
      clusterId: true
    }
  });

  if (stores.length === 0) {
    return Response.json({
      date: formatDateKey(day),
      stores: [],
      selectedStoreId: null,
      uploadDay: null
    });
  }

  const selectedStoreId =
    selectedStoreIdRaw && stores.some((store) => store.id === selectedStoreIdRaw) ? selectedStoreIdRaw : stores[0].id;

  const uploadDay = await prisma.uploadDay.findUnique({
    where: {
      storeId_date: {
        storeId: selectedStoreId,
        date: day
      }
    },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          storeCode: true
        }
      },
      files: {
        where: {
          isCurrentVersion: true
        },
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          slotName: true,
          sequence: true,
          kind: true,
          finalFilename: true,
          mimeType: true,
          driveFileId: true,
          driveWebViewLink: true,
          bytes: true,
          createdAt: true,
          versionGroupId: true,
          versionNumber: true,
          isCurrentVersion: true,
          validatedAt: true,
          validatedByRole: true
        }
      }
    }
  });

  let unreadByVersionGroup: Record<string, number> = {};
  let threadCountByVersionGroup: Record<string, number> = {};

  if (uploadDay && uploadDay.files.length > 0) {
    const groups = [...new Set(uploadDay.files.map((file) => file.versionGroupId))];
    const threads = await prisma.mediaThread.findMany({
      where: {
        storeId: selectedStoreId,
        versionGroupId: { in: groups }
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        reads: {
          where: {
            userId: manager.session.uid
          },
          take: 1
        }
      }
    });

    for (const thread of threads) {
      threadCountByVersionGroup[thread.versionGroupId] = (threadCountByVersionGroup[thread.versionGroupId] || 0) + 1;
      const lastMsg = thread.messages[0];
      const read = thread.reads[0];
      if (lastMsg && lastMsg.authorUserId !== manager.session.uid) {
        const unread = !read || lastMsg.createdAt > read.lastReadAt;
        if (unread) {
          unreadByVersionGroup[thread.versionGroupId] = (unreadByVersionGroup[thread.versionGroupId] || 0) + 1;
        }
      }
    }
  }

  return Response.json({
    date: formatDateKey(day),
    stores,
    selectedStoreId,
    uploadDay: uploadDay
      ? {
          id: uploadDay.id,
          status: uploadDay.status,
          requirementKind: uploadDay.requirementKind,
          isSent: uploadDay.isSent,
          driveFolderId: uploadDay.driveFolderId,
          store: uploadDay.store,
          files: uploadDay.files.map((file) => ({
            ...file,
            thumbUrl: file.kind === "PHOTO" ? `https://drive.google.com/thumbnail?id=${file.driveFileId}` : null,
            downloadUrl: `/api/admin/media/file/${file.id}/download`,
            threadCount: threadCountByVersionGroup[file.versionGroupId] || 0,
            unreadThreadCount: unreadByVersionGroup[file.versionGroupId] || 0
          }))
        }
      : null
  });
}
