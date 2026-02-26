import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  slots: z
    .array(
      z.object({
        name: z.string().min(1),
        order: z.number().int().min(0),
        required: z.boolean().default(true),
        allowMultiple: z.boolean().default(false)
      })
    )
    .optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const { id } = await context.params;
  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: "STORE" },
        select: {
          id: true,
          username: true,
          email: true,
          mustChangePw: true
        }
      },
      slotTemplates: {
        where: { storeId: id },
        orderBy: { order: "asc" }
      },
      uploadDays: {
        orderBy: { date: "desc" },
        take: 30,
        include: {
          files: {
            select: {
              id: true,
              slotName: true,
              finalFilename: true,
              driveFileId: true,
              driveWebViewLink: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  if (!store) {
    return badRequest("Store not found");
  }

  return Response.json({
    item: store
  });
}

export async function PATCH(request: Request, context: Context) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const data = parsed.data;
  if (data.slots?.length) {
    const names = data.slots.map((slot) => slot.name.trim().toUpperCase());
    if (new Set(names).size !== names.length) {
      return badRequest("slots contain duplicated names");
    }
  }
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) {
    return badRequest("Store not found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.store.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.deadlineTime !== undefined ? { deadlineTime: data.deadlineTime } : {})
      }
    });

    if (data.slots) {
      await tx.slotTemplate.deleteMany({ where: { storeId: id } });
      if (data.slots.length > 0) {
        await tx.slotTemplate.createMany({
          data: data.slots.map((slot) => ({
            storeId: id,
            name: slot.name.trim().toUpperCase(),
            order: slot.order,
            required: slot.required,
            allowMultiple: slot.allowMultiple
          }))
        });
      }
    }
  });

  await writeAuditLog({
    action: "ADMIN_STORE_UPDATED",
    userId: admin.uid,
    storeId: id,
    payload: data
  });

  const updated = await prisma.store.findUnique({
    where: { id },
    include: {
      slotTemplates: {
        where: { storeId: id },
        orderBy: { order: "asc" }
      },
      users: {
        where: { role: "STORE" },
        select: { id: true, username: true, email: true }
      },
      uploadDays: {
        orderBy: { date: "desc" },
        take: 30,
        include: {
          files: {
            select: {
              id: true,
              slotName: true,
              finalFilename: true,
              driveFileId: true,
              driveWebViewLink: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  return Response.json({ ok: true, item: updated });
}
