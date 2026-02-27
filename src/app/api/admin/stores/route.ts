import { z } from "zod";
import { UploadStatus } from "@prisma/client";
import { hashPassword } from "@/lib/auth";
import { DEFAULT_DEADLINE } from "@/lib/constants";
import { formatDateKey, toDayStart } from "@/lib/date";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireManager, storeScopeWhere } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const slotSchema = z.object({
  name: z.string().min(1),
  order: z.number().int().min(0),
  required: z.boolean().default(true),
  allowMultiple: z.boolean().default(false)
});

const createStoreSchema = z.object({
  name: z.string().min(1),
  storeCode: z.string().min(1).max(10),
  clusterId: z.string().optional(),
  username: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  deadlineTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  slots: z.array(slotSchema).optional()
});

function randomPassword(size = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let value = "";
  for (let i = 0; i < size; i++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

export async function GET(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const today = toDayStart(new Date());
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");
  const includeInactive = url.searchParams.get("includeInactive") === "true";

  const scope = storeScopeWhere(manager);
  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...scope
  };

  const stores = await prisma.store.findMany({
    where,
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
          email: true
        }
      },
      uploadDays: {
        where: { date: today },
        select: {
          id: true,
          status: true,
          completedAt: true,
          updatedAt: true,
          driveFolderId: true,
          isSent: true,
          requirementKind: true
        },
        take: 1
      },
      alerts: {
        where: {
          date: today,
          resolvedAt: null
        },
        select: {
          id: true
        }
      },
      _count: {
        select: {
          messages: {
            where: {
              readAt: null,
              fromRole: {
                in: ["STORE", "CLUSTER"]
              }
            }
          }
        }
      }
    },
    orderBy: {
      storeCode: "asc"
    }
  });

  const list = stores
    .map((store) => {
      const todayUpload = store.uploadDays[0];
      const status = todayUpload?.status ?? UploadStatus.PENDING;
      return {
        id: store.id,
        name: store.name,
        storeCode: store.storeCode,
        cluster: store.cluster,
        isActive: store.isActive,
        deadlineTime: store.deadlineTime ?? DEFAULT_DEADLINE,
        todayStatus: status,
        todayIsSent: todayUpload?.isSent ?? false,
        todayRequirementKind: todayUpload?.requirementKind ?? "NONE",
        todayDate: formatDateKey(today),
        todayDriveFolderId: todayUpload?.driveFolderId ?? null,
        lastUploadAt: todayUpload?.updatedAt ?? null,
        hasAlert: store.alerts.length > 0,
        unreadMessages: store._count.messages,
        user: store.users[0] ?? null
      };
    })
    .filter((item) => {
      if (!statusFilter) {
        return true;
      }
      return item.todayStatus === statusFilter;
    });

  return Response.json({ items: list });
}

export async function POST(request: Request) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }
  if (!manager.isSuperAdmin) {
    return forbidden("Solo superadmin puede crear tiendas");
  }

  const body = await request.json().catch(() => null);
  const parsed = createStoreSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const payload = parsed.data;
  const storeCode = payload.storeCode.trim().toUpperCase();
  const username = payload.username.trim().toLowerCase();

  if (payload.slots?.length) {
    const names = payload.slots.map((slot) => slot.name.trim().toUpperCase());
    if (new Set(names).size !== names.length) {
      return badRequest("slots contain duplicated names");
    }
  }

  if (payload.clusterId) {
    const cluster = await prisma.cluster.findUnique({
      where: { id: payload.clusterId },
      select: { id: true }
    });
    if (!cluster) {
      return badRequest("clusterId no válido");
    }
  }

  const existingStore = await prisma.store.findUnique({ where: { storeCode } });
  if (existingStore) {
    return badRequest("storeCode already exists");
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [{ username }, payload.email ? { email: payload.email } : { id: "__none__" }]
    }
  });
  if (existingUser) {
    return badRequest("username/email already exists");
  }

  const generatedPassword = payload.password || randomPassword(12);
  const passwordHash = await hashPassword(generatedPassword);

  const created = await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({
      data: {
        name: payload.name.trim(),
        storeCode,
        clusterId: payload.clusterId ?? null,
        deadlineTime: payload.deadlineTime ?? null
      }
    });

    await tx.user.create({
      data: {
        role: "STORE",
        username,
        email: payload.email?.trim().toLowerCase() ?? null,
        passwordHash,
        mustChangePw: true,
        storeId: store.id,
        clusterId: store.clusterId
      }
    });

    if (payload.slots?.length) {
      await tx.slotTemplate.createMany({
        data: payload.slots.map((slot) => ({
          name: slot.name.trim().toUpperCase(),
          order: slot.order,
          required: slot.required,
          allowMultiple: slot.allowMultiple,
          storeId: store.id
        }))
      });
    }

    return store;
  });

  await writeAuditLog({
    action: "ADMIN_STORE_CREATED",
    userId: manager.session.uid,
    storeId: created.id,
    payload: {
      storeCode: created.storeCode,
      username
    }
  });

  return Response.json({
    ok: true,
    item: {
      id: created.id,
      name: created.name,
      storeCode: created.storeCode,
      clusterId: created.clusterId,
      deadlineTime: created.deadlineTime ?? DEFAULT_DEADLINE
    },
    credentials: {
      username,
      password: generatedPassword
    }
  });
}
