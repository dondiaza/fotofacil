import { formatDateKey, parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireStore } from "@/lib/request-auth";

export async function GET(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date") || todayDateKey();

  let day: Date;
  try {
    day = parseDateKey(dateParam);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const uploadDay = await prisma.uploadDay.findUnique({
    where: {
      storeId_date: {
        storeId: auth.store.id,
        date: day
      }
    },
    include: {
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

  if (!uploadDay) {
    return Response.json({
      date: formatDateKey(day),
      uploadDay: null
    });
  }

  const groups = [...new Set(uploadDay.files.map((file) => file.versionGroupId))];
  const threads =
    groups.length > 0
      ? await prisma.mediaThread.findMany({
          where: {
            storeId: auth.store.id,
            versionGroupId: { in: groups }
          },
          include: {
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1
            },
            reads: {
              where: {
                userId: auth.session.uid
              },
              take: 1
            }
          }
        })
      : [];

  const unreadByGroup: Record<string, number> = {};
  const threadByGroup: Record<string, number> = {};

  for (const thread of threads) {
    threadByGroup[thread.versionGroupId] = (threadByGroup[thread.versionGroupId] || 0) + 1;
    const lastMessage = thread.messages[0];
    const read = thread.reads[0];
    if (lastMessage && lastMessage.authorUserId !== auth.session.uid) {
      const unread = !read || lastMessage.createdAt > read.lastReadAt;
      if (unread) {
        unreadByGroup[thread.versionGroupId] = (unreadByGroup[thread.versionGroupId] || 0) + 1;
      }
    }
  }

  return Response.json({
    date: formatDateKey(day),
    uploadDay: {
      id: uploadDay.id,
      status: uploadDay.status,
      isSent: uploadDay.isSent,
      requirementKind: uploadDay.requirementKind,
      driveFolderId: uploadDay.driveFolderId,
      files: uploadDay.files.map((file) => ({
        ...file,
        thumbUrl: file.kind === "PHOTO" ? `https://drive.google.com/thumbnail?id=${file.driveFileId}` : null,
        downloadUrl: `/api/store/media/file/${file.id}/download`,
        threadCount: threadByGroup[file.versionGroupId] || 0,
        unreadThreadCount: unreadByGroup[file.versionGroupId] || 0
      }))
    }
  });
}
