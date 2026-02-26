import { UploadStatus } from "@prisma/client";
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
  const dateParam = url.searchParams.get("date") ?? todayDateKey();

  let day: Date;
  try {
    day = parseDateKey(dateParam);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  const stores = await prisma.store.findMany({
    where: {
      isActive: true
    },
    include: {
      uploadDays: {
        where: { date: day },
        take: 1,
        include: {
          files: true
        }
      }
    },
    orderBy: { storeCode: "asc" }
  });

  return Response.json({
    date: formatDateKey(day),
    items: stores.map((store) => {
      const dayInfo = store.uploadDays[0];
      return {
        storeId: store.id,
        storeCode: store.storeCode,
        storeName: store.name,
        status: dayInfo?.status ?? UploadStatus.PENDING,
        driveFolderId: dayInfo?.driveFolderId ?? null,
        fileCount: dayInfo?.files.length ?? 0,
        lastActivityAt: dayInfo?.updatedAt ?? null
      };
    })
  });
}
