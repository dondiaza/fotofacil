import { z } from "zod";
import { parseDateKey } from "@/lib/date";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  storeId: z.string().min(1),
  date: z.string().min(1),
  validated: z.boolean().optional()
});

export async function POST(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  let day: Date;
  try {
    day = parseDateKey(parsed.data.date);
  } catch (error) {
    return badRequest((error as Error).message);
  }

  if (!(await canManagerAccessStore(manager, parsed.data.storeId))) {
    return forbidden();
  }

  const uploadDay = await prisma.uploadDay.findUnique({
    where: {
      storeId_date: {
        storeId: parsed.data.storeId,
        date: day
      }
    },
    include: {
      files: {
        where: {
          isCurrentVersion: true
        },
        select: {
          id: true
        }
      }
    }
  });

  if (!uploadDay) {
    return badRequest("No hay jornada de subida para esa tienda/fecha");
  }
  if (uploadDay.files.length === 0) {
    return badRequest("No hay archivos para validar");
  }

  const validated = parsed.data.validated ?? true;
  const validatedAt = validated ? new Date() : null;

  await prisma.uploadFile.updateMany({
    where: {
      id: {
        in: uploadDay.files.map((file) => file.id)
      }
    },
    data: {
      validatedAt,
      validatedByUserId: validated ? manager.session.uid : null,
      validatedByRole: validated ? manager.session.role : null
    }
  });

  await writeAuditLog({
    action: validated ? "MEDIA_DAY_VALIDATED_ALL" : "MEDIA_DAY_UNVALIDATED_ALL",
    userId: manager.session.uid,
    storeId: parsed.data.storeId,
    payload: {
      uploadDayId: uploadDay.id,
      files: uploadDay.files.length
    }
  });

  return Response.json({
    ok: true,
    summary: {
      validated: validated ? uploadDay.files.length : 0,
      total: uploadDay.files.length
    }
  });
}
