import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  clusterId: z.string().nullable().optional(),
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
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const { id } = await context.params;
  if (!(await canManagerAccessStore(manager, id))) {
    return forbidden();
  }

  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      cluster: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
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
              kind: true,
              finalFilename: true,
              driveFileId: true,
              driveWebViewLink: true,
              isCurrentVersion: true,
              versionGroupId: true,
              versionNumber: true,
              validatedAt: true,
              validatedByRole: true,
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
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const { id } = await context.params;
  if (!(await canManagerAccessStore(manager, id))) {
    return forbidden();
  }

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

  if (!manager.isSuperAdmin && data.clusterId !== undefined && data.clusterId !== store.clusterId) {
    return forbidden("Cluster no puede reasignar tiendas a otro cluster");
  }

  if (manager.isSuperAdmin && data.clusterId !== undefined && data.clusterId !== null) {
    const clusterExists = await prisma.cluster.findUnique({
      where: { id: data.clusterId },
      select: { id: true }
    });
    if (!clusterExists) {
      return badRequest("clusterId no válido");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.store.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.deadlineTime !== undefined ? { deadlineTime: data.deadlineTime } : {}),
        ...(manager.isSuperAdmin && data.clusterId !== undefined ? { clusterId: data.clusterId } : {})
      }
    });

    if (manager.isSuperAdmin && data.clusterId !== undefined) {
      await tx.user.updateMany({
        where: {
          storeId: id,
          role: "STORE"
        },
        data: {
          clusterId: data.clusterId
        }
      });
    }

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
    userId: manager.session.uid,
    storeId: id,
    payload: data
  });

  const updated = await prisma.store.findUnique({
    where: { id },
    include: {
      cluster: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
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
              kind: true,
              finalFilename: true,
              driveFileId: true,
              driveWebViewLink: true,
              isCurrentVersion: true,
              versionGroupId: true,
              versionNumber: true,
              validatedAt: true,
              validatedByRole: true,
              createdAt: true
            }
          }
        }
      }
    }
  });

  return Response.json({ ok: true, item: updated });
}
