import { addDays, endOfDay, startOfWeek } from "date-fns";
import { formatDateKey, parseDateKey, toDayStart, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager, storeScopeWhere } from "@/lib/request-auth";
import { getRequirementForStoreDate } from "@/lib/upload-requirements";

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const weekStartParam = url.searchParams.get("weekStart") || null;

  let weekStart: Date;
  if (weekStartParam) {
    try {
      weekStart = parseDateKey(weekStartParam);
    } catch (error) {
      return badRequest((error as Error).message);
    }
  } else {
    weekStart = toDayStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  }
  const weekEnd = endOfDay(addDays(weekStart, 6));

  const stores = await prisma.store.findMany({
    where: {
      isActive: true,
      ...storeScopeWhere(manager)
    },
    orderBy: [{ storeCode: "asc" }],
    select: {
      id: true,
      name: true,
      storeCode: true,
      clusterId: true,
      cluster: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });

  if (stores.length === 0) {
    return Response.json({
      weekStart: formatDateKey(weekStart),
      weekEnd: formatDateKey(addDays(weekStart, 6)),
      items: []
    });
  }

  const storeIds = stores.map((store) => store.id);
  const [uploadDays, unresolvedByStore] = await Promise.all([
    prisma.uploadDay.findMany({
      where: {
        storeId: { in: storeIds },
        date: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      include: {
        files: {
          where: {
            isCurrentVersion: true
          },
          select: {
            id: true,
            validatedAt: true
          }
        }
      }
    }),
    prisma.mediaThread.groupBy({
      by: ["storeId"],
      where: {
        storeId: { in: storeIds },
        resolvedAt: null,
        updatedAt: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      _count: { _all: true }
    })
  ]);

  const unresolvedMap = new Map(unresolvedByStore.map((item) => [item.storeId, item._count._all]));

  const uploadMap = new Map<string, (typeof uploadDays)[number][]>();
  for (const day of uploadDays) {
    const list = uploadMap.get(day.storeId) || [];
    list.push(day);
    uploadMap.set(day.storeId, list);
  }

  const weekDates = Array.from({ length: 7 }).map((_, index) => toDayStart(addDays(weekStart, index)));

  const items = [];
  for (const store of stores) {
    const days = uploadMap.get(store.id) || [];
    const byDate = new Map(days.map((day) => [formatDateKey(day.date), day]));

    let requiredDays = 0;
    let sentDays = 0;
    for (const date of weekDates) {
      const key = formatDateKey(date);
      const existing = byDate.get(key);
      const requirement =
        existing?.requirementKind || (await getRequirementForStoreDate(store.id, store.clusterId ?? null, date));

      if (requirement !== "NONE") {
        requiredDays += 1;
        if (existing?.isSent) {
          sentDays += 1;
        }
      }
    }

    const totalFiles = days.reduce((acc, day) => acc + day.files.length, 0);
    const validatedFiles = days.reduce(
      (acc, day) => acc + day.files.filter((file) => Boolean(file.validatedAt)).length,
      0
    );

    items.push({
      storeId: store.id,
      storeCode: store.storeCode,
      storeName: store.name,
      cluster: store.cluster,
      weekStart: formatDateKey(weekStart),
      weekEnd: formatDateKey(addDays(weekStart, 6)),
      requiredDays,
      sentDays,
      validatedFiles,
      totalFiles,
      incidents: unresolvedMap.get(store.id) || 0
    });
  }

  return Response.json({
    weekStart: formatDateKey(weekStart),
    weekEnd: formatDateKey(addDays(weekStart, 6)),
    items
  });
}
