import { addDays } from "date-fns";
import { formatDateKey, toDayStart, todayDateKey } from "@/lib/date";
import { notifyManyByEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type OffDateInput = {
  storeId: string;
  storeCode: string;
  storeName: string;
  clusterId: string | null;
  uploadDate: Date;
};

export async function notifyClusterOnOffDateUpload(input: OffDateInput) {
  const targetDate = formatDateKey(input.uploadDate);
  const today = todayDateKey();
  if (targetDate === today) {
    return;
  }
  if (!input.clusterId) {
    return;
  }

  const messageText = `Aviso automático: ${input.storeCode} subió contenido para ${targetDate} en fecha real ${today}.`;
  const dayStart = toDayStart(new Date());
  const dayEnd = addDays(dayStart, 1);

  const existing = await prisma.message.findFirst({
    where: {
      storeId: input.storeId,
      fromRole: "STORE",
      text: messageText,
      createdAt: {
        gte: dayStart,
        lt: dayEnd
      }
    },
    select: { id: true }
  });

  if (!existing) {
    await prisma.message.create({
      data: {
        storeId: input.storeId,
        fromRole: "STORE",
        text: messageText
      }
    });
  }

  const clusterUsers = await prisma.user.findMany({
    where: {
      role: "CLUSTER",
      clusterId: input.clusterId,
      email: { not: null }
    },
    select: {
      email: true
    }
  });

  const emails = clusterUsers.map((user) => user.email).filter((email): email is string => Boolean(email));
  if (emails.length > 0) {
    await notifyManyByEmail(
      emails,
      `Subida fuera de fecha: ${input.storeCode}`,
      `${input.storeName} (${input.storeCode}) subió contenido para ${targetDate} en fecha real ${today}.`
    );
  }
}
