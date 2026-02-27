import { DEFAULT_DEADLINE } from "@/lib/constants";
import { formatDateKey, nowMinutes, parseDeadlineToMinutes, toDayStart } from "@/lib/date";
import { badRequest } from "@/lib/http";
import { notifyAdminByEmail, notifyManyByEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getOrCreateUploadDay, refreshUploadDayStatus } from "@/lib/store-service";
import { requirementToHuman } from "@/lib/upload-requirements";
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
      cluster: {
        select: {
          id: true,
          name: true,
          users: {
            where: {
              role: "CLUSTER",
              email: { not: null }
            },
            select: {
              email: true
            }
          }
        }
      },
      users: {
        where: {
          role: "STORE",
          email: { not: null }
        },
        select: {
          email: true
        }
      }
    }
  });

  const triggered: Array<{ storeId: string; storeCode: string; name: string; clusterName: string | null }> = [];
  const recipients = new Set<string>();

  for (const store of stores) {
    const deadline = store.deadlineTime || DEFAULT_DEADLINE;
    const deadlineMinutes = parseDeadlineToMinutes(deadline);
    if (nowMins < deadlineMinutes) {
      continue;
    }

    const uploadDay = await getOrCreateUploadDay(store.id, store.clusterId ?? null, today);
    const updatedDay = await refreshUploadDayStatus(uploadDay.id);
    if (!updatedDay) {
      continue;
    }

    if (updatedDay.requirementKind === "NONE") {
      continue;
    }
    if (updatedDay.isSent) {
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
        text: `Recordatorio automático: hoy se requiere ${requirementToHuman(updatedDay.requirementKind)} y aún está en "No enviado".`
      }
    });

    await writeAuditLog({
      action: "ALERT_MISSING_UPLOAD",
      storeId: store.id,
      payload: {
        date: formatDateKey(today),
        deadline,
        requirementKind: updatedDay.requirementKind,
        clusterId: store.clusterId
      }
    });

    triggered.push({
      storeId: store.id,
      storeCode: store.storeCode,
      name: store.name,
      clusterName: store.cluster?.name ?? null
    });

    for (const clusterUser of store.cluster?.users || []) {
      if (clusterUser.email) {
        recipients.add(clusterUser.email);
      }
    }
    for (const storeUser of store.users) {
      if (storeUser.email) {
        recipients.add(storeUser.email);
      }
    }
  }

  if (triggered.length > 0) {
    const subject = "Alertas FotoFacil: tiendas No enviadas";
    const text = `Fecha ${formatDateKey(today)}. Pendientes: ${triggered
      .map((s) => `${s.clusterName ? `[${s.clusterName}] ` : ""}${s.storeCode} ${s.name}`)
      .join(", ")}`;
    await notifyAdminByEmail(subject, text);
    await notifyManyByEmail([...recipients], subject, text);
  }

  return Response.json({
    ok: true,
    date: formatDateKey(today),
    triggeredCount: triggered.length,
    triggered
  });
}
