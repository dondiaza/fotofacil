import { parseDateKey, todayDateKey } from "@/lib/date";
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

  const items = await prisma.alert.findMany({
    where: { date: day },
    include: {
      store: {
        select: {
          id: true,
          name: true,
          storeCode: true
        }
      }
    },
    orderBy: { triggeredAt: "desc" }
  });

  return Response.json({
    items
  });
}
