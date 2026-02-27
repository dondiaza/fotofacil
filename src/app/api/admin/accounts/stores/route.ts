import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).optional(),
  username: z.string().min(3).optional(),
  email: z.string().email().nullable().optional(),
  clusterId: z.string().nullable().optional(),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(8).optional()
});

const bulkSchema = z.object({
  items: z.array(
    z.object({
      storeId: z.string().min(1),
      clusterId: z.string().nullable()
    })
  )
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const store = await prisma.store.findUnique({
    where: { id: parsed.data.storeId },
    include: {
      users: {
        where: { role: "STORE" },
        take: 1
      }
    }
  });
  if (!store) {
    return badRequest("Tienda no encontrada");
  }

  if (parsed.data.clusterId) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: parsed.data.clusterId },
      select: { id: true }
    });
    if (!cluster) {
      return badRequest("clusterId no válido");
    }
  }

  const nextUsername = parsed.data.username?.trim().toLowerCase();
  const nextEmail = parsed.data.email === null ? null : parsed.data.email?.trim().toLowerCase();

  if (nextUsername && nextUsername !== store.users[0]?.username) {
    const exists = await prisma.user.findUnique({
      where: { username: nextUsername },
      select: { id: true }
    });
    if (exists) {
      return badRequest("Username en uso");
    }
  }

  if (nextEmail !== undefined && nextEmail !== store.users[0]?.email) {
    if (nextEmail) {
      const exists = await prisma.user.findFirst({
        where: {
          email: nextEmail,
          id: { not: store.users[0]?.id || "__none__" }
        },
        select: { id: true }
      });
      if (exists) {
        return badRequest("Email en uso");
      }
    }
  }

  const patchPassword = parsed.data.resetPassword ? await hashPassword(parsed.data.resetPassword) : null;

  await prisma.$transaction(async (tx) => {
    await tx.store.update({
      where: { id: store.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.clusterId !== undefined ? { clusterId: parsed.data.clusterId } : {}),
        ...(parsed.data.deadlineTime !== undefined ? { deadlineTime: parsed.data.deadlineTime } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {})
      }
    });

    const user = store.users[0];
    if (user) {
      await tx.user.update({
        where: { id: user.id },
        data: {
          ...(nextUsername ? { username: nextUsername } : {}),
          ...(nextEmail !== undefined ? { email: nextEmail } : {}),
          ...(parsed.data.clusterId !== undefined ? { clusterId: parsed.data.clusterId } : {}),
          ...(patchPassword
            ? {
                passwordHash: patchPassword,
                mustChangePw: true
              }
            : {})
        }
      });
    }
  });

  await writeAuditLog({
    action: "ADMIN_STORE_ACCOUNT_UPDATED",
    userId: admin.uid,
    storeId: store.id,
    payload: {
      clusterId: parsed.data.clusterId
    }
  });

  return Response.json({ ok: true });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const clusterIds = [...new Set(parsed.data.items.map((item) => item.clusterId).filter((value): value is string => Boolean(value)))];
  if (clusterIds.length > 0) {
    const found = await prisma.cluster.findMany({
      where: { id: { in: clusterIds } },
      select: { id: true }
    });
    const foundSet = new Set(found.map((cluster) => cluster.id));
    for (const clusterId of clusterIds) {
      if (!foundSet.has(clusterId)) {
        return badRequest(`clusterId inválido: ${clusterId}`);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of parsed.data.items) {
      await tx.store.update({
        where: { id: item.storeId },
        data: {
          clusterId: item.clusterId
        }
      });
      await tx.user.updateMany({
        where: {
          storeId: item.storeId,
          role: "STORE"
        },
        data: {
          clusterId: item.clusterId
        }
      });
    }
  });

  await writeAuditLog({
    action: "ADMIN_STORE_CLUSTER_BULK_LINK",
    userId: admin.uid,
    payload: {
      count: parsed.data.items.length
    }
  });

  return Response.json({ ok: true });
}
