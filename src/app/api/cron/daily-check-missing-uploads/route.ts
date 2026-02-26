import { UploadStatus } from "@prisma/client";
import { DEFAULT_DEADLINE } from "@/lib/constants";
import { formatDateKey, nowMinutes, parseDeadlineToMinutes, toDayStart } from "@/lib/date";
import { badRequest } from "@/lib/http";
import { notifyAdminByEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function POST(request: Request) {
  const cronSecret = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return badRequest("Invalid cron secret");
  }

  const today = toDayStart(new Date());
  const nowMins = nowMinutes();
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    include: {
      uploadDays: {
        where: { date: today },
        select: {
          id: true,
          status: true
        },
        take: 1
      }
    }
  });

  const triggered: Array<{ storeId: string; storeCode: string; name: string }> = [];

  for (const store of stores) {
    const deadline = store.deadlineTime || DEFAULT_DEADLINE;
    const deadlineMinutes = parseDeadlineToMinutes(deadline);
    if (nowMins < deadlineMinutes) {
      continue;
    }

    const todayStatus = store.uploadDays[0]?.status ?? UploadStatus.PENDING;
    if (todayStatus === UploadStatus.COMPLETE) {
      continue;
    }

    const exists = await prisma.alert.findUnique({
      where: {
        storeId_date_type: {
          storeId: store.id,
          date: today,
          type: "MISSING_UPLOAD"
        }
      }
    });
    if (exists) {
      continue;
    }

    await prisma.alert.create({
      data: {
        storeId: store.id,
        date: today,
        type: "MISSING_UPLOAD"
      }
    });

    await prisma.message.create({
      data: {
        storeId: store.id,
        fromRole: "SUPERADMIN",
        text: "Recordatorio automático: aún no se ha completado el set diario de fotos."
      }
    });

    await writeAuditLog({
      action: "ALERT_MISSING_UPLOAD",
      storeId: store.id,
      payload: {
        date: formatDateKey(today),
        deadline
      }
    });

    triggered.push({
      storeId: store.id,
      storeCode: store.storeCode,
      name: store.name
    });
  }

  if (triggered.length > 0) {
    await notifyAdminByEmail(
      "Alertas de FotoFácil: tiendas sin set diario completo",
      `Fecha ${formatDateKey(today)}. Tiendas: ${triggered
        .map((s) => `${s.storeCode} ${s.name}`)
        .join(", ")}`
    );
  }

  return Response.json({
    ok: true,
    date: formatDateKey(today),
    triggeredCount: triggered.length,
    triggered
  });
}
