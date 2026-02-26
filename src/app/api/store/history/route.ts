import { subDays } from "date-fns";
import { formatDateKey, parseDateKey, toDayStart } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { requireStore } from "@/lib/request-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const auth = await requireStore();
  if (!auth) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  let from = subDays(toDayStart(new Date()), 30);
  let to = toDayStart(new Date());

  if (fromParam) {
    try {
      from = parseDateKey(fromParam);
    } catch (error) {
      return badRequest((error as Error).message);
    }
  }

  if (toParam) {
    try {
      to = parseDateKey(toParam);
    } catch (error) {
      return badRequest((error as Error).message);
    }
  }

  if (from > to) {
    return badRequest("from must be before to");
  }

  const items = await prisma.uploadDay.findMany({
    where: {
      storeId: auth.store.id,
      date: {
        gte: from,
        lte: to
      }
    },
    orderBy: {
      date: "desc"
    },
    include: {
      files: {
        select: { id: true }
      }
    }
  });

  return Response.json({
    items: items.map((item) => ({
      id: item.id,
      date: formatDateKey(item.date),
      status: item.status,
      completedAt: item.completedAt,
      fileCount: item.files.length,
      driveFolderId: item.driveFolderId
    }))
  });
}
