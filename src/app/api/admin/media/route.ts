import { formatDateKey, parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
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
    where: { isActive: true },
    orderBy: { storeCode: "asc" },
    select: {
      id: true,
      name: true,
      storeCode: true
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
    selectedStoreIdRaw && stores.some((store) => store.id === selectedStoreIdRaw)
      ? selectedStoreIdRaw
      : stores[0].id;

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
        orderBy: [{ slotName: "asc" }, { sequence: "asc" }],
        select: {
          id: true,
          slotName: true,
          sequence: true,
          finalFilename: true,
          mimeType: true,
          driveFileId: true,
          driveWebViewLink: true,
          bytes: true,
          createdAt: true
        }
      }
    }
  });

  return Response.json({
    date: formatDateKey(day),
    stores,
    selectedStoreId,
    uploadDay: uploadDay
      ? {
          id: uploadDay.id,
          status: uploadDay.status,
          driveFolderId: uploadDay.driveFolderId,
          store: uploadDay.store,
          files: uploadDay.files.map((file) => ({
            ...file,
            thumbUrl: `https://drive.google.com/thumbnail?id=${file.driveFileId}`,
            downloadUrl: `/api/admin/media/file/${file.id}/download`
          }))
        }
      : null
  });
}
