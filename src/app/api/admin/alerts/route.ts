import { parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/request-auth";

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
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

  const where = manager.isSuperAdmin
    ? { date: day }
    : {
        date: day,
        store: {
          clusterId: manager.clusterId
        }
      };

  const items = await prisma.alert.findMany({
    where,
    include: {
      store: {
        select: {
          id: true,
          name: true,
          storeCode: true,
          clusterId: true
        }
      }
    },
    orderBy: { triggeredAt: "desc" }
  });

  return Response.json({
    items
  });
}
