import { parseDateKey, todayDateKey } from "@/lib/date";
import { badRequest, unauthorized } from "@/lib/http";
import { requireStore } from "@/lib/request-auth";
import { getStoreDayView } from "@/lib/store-service";

export async function GET(request: Request) {
  const auth = await requireStore();
  if (!auth) {
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

  const view = await getStoreDayView(auth.store.id, auth.store.clusterId ?? null, day);
  return Response.json(view);
}
