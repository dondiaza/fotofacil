import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager } from "@/lib/request-auth";
import { canManagerAccessStore } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  validated: z.boolean()
});

type Context = {
  params: Promise<{ fileId: string }>;
};

export async function POST(request: Request, context: Context) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("validated debe ser boolean");
  }

  const { fileId } = await context.params;
  const file = await prisma.uploadFile.findUnique({
    where: { id: fileId },
    include: {
      uploadDay: {
        select: {
          id: true,
          storeId: true,
          requirementKind: true
        }
      }
    }
  });
  if (!file) {
    return badRequest("Archivo no encontrado");
  }

  if (!(await canManagerAccessStore(manager, file.uploadDay.storeId))) {
    return forbidden();
  }

  const validatedAt = parsed.data.validated ? new Date() : null;
  const updated = await prisma.uploadFile.update({
    where: { id: file.id },
    data: {
      validatedAt,
      validatedByUserId: parsed.data.validated ? manager.session.uid : null,
      validatedByRole: parsed.data.validated ? manager.session.role : null
    },
    select: {
      id: true,
      validatedAt: true,
      validatedByRole: true
    }
  });

  const allCurrent = await prisma.uploadFile.findMany({
    where: {
      uploadDayId: file.uploadDay.id,
      isCurrentVersion: true
    },
    select: {
      id: true,
      kind: true,
      validatedAt: true
    }
  });

  const requiredKinds =
    file.uploadDay.requirementKind === "BOTH"
      ? new Set(["PHOTO", "VIDEO"])
      : file.uploadDay.requirementKind === "PHOTO"
        ? new Set(["PHOTO"])
        : file.uploadDay.requirementKind === "VIDEO"
          ? new Set(["VIDEO"])
          : new Set(["PHOTO", "VIDEO"]);

  const scoped = allCurrent.filter((entry) => requiredKinds.has(entry.kind));
  const validatedCount = scoped.filter((entry) => Boolean(entry.validatedAt)).length;

  await writeAuditLog({
    action: parsed.data.validated ? "MEDIA_FILE_VALIDATED" : "MEDIA_FILE_UNVALIDATED",
    userId: manager.session.uid,
    storeId: file.uploadDay.storeId,
    payload: {
      fileId: file.id,
      uploadDayId: file.uploadDay.id
    }
  });

  return Response.json({
    ok: true,
    item: updated,
    summary: {
      validated: validatedCount,
      total: scoped.length,
      allTotal: allCurrent.length
    }
  });
}
