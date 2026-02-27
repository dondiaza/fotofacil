import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const createSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email().optional(),
  password: z.string().min(8).optional()
});

const patchSchema = z.object({
  clusterId: z.string().min(1),
  code: z.string().min(2).max(20).optional(),
  name: z.string().min(2).optional(),
  username: z.string().min(3).optional(),
  email: z.string().email().nullable().optional(),
  isActive: z.boolean().optional(),
  resetPassword: z.string().min(8).optional()
});

function randomPassword(size = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let value = "";
  for (let i = 0; i < size; i++) {
    value += chars[Math.floor(Math.random() * chars.length)];
  }
  return value;
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const code = parsed.data.code.trim().toUpperCase();
  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email?.trim().toLowerCase() || null;
  const password = parsed.data.password || randomPassword();

  const clusterExists = await prisma.cluster.findUnique({
    where: { code },
    select: { id: true }
  });
  if (clusterExists) {
    return badRequest("Ya existe un cluster con ese código");
  }

  const userExists = await prisma.user.findFirst({
    where: {
      OR: [{ username }, email ? { email } : { id: "__none__" }]
    },
    select: { id: true }
  });
  if (userExists) {
    return badRequest("Username o email ya en uso");
  }

  const passwordHash = await hashPassword(password);

  const created = await prisma.$transaction(async (tx) => {
    const cluster = await tx.cluster.create({
      data: {
        code,
        name: parsed.data.name.trim(),
        isActive: true
      }
    });

    const user = await tx.user.create({
      data: {
        role: "CLUSTER",
        username,
        email,
        passwordHash,
        mustChangePw: true,
        clusterId: cluster.id,
        storeId: null
      }
    });

    return { cluster, user };
  });

  await writeAuditLog({
    action: "ADMIN_CLUSTER_CREATED",
    userId: admin.uid,
    payload: {
      clusterId: created.cluster.id,
      username: created.user.username
    }
  });

  return Response.json({
    ok: true,
    item: {
      id: created.cluster.id,
      code: created.cluster.code,
      name: created.cluster.name,
      isActive: created.cluster.isActive,
      managerUser: {
        id: created.user.id,
        username: created.user.username,
        email: created.user.email
      }
    },
    credentials: {
      username: created.user.username,
      password
    }
  });
}

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

  const cluster = await prisma.cluster.findUnique({
    where: { id: parsed.data.clusterId },
    include: {
      users: {
        where: { role: "CLUSTER" },
        take: 1
      }
    }
  });
  if (!cluster) {
    return badRequest("Cluster no encontrado");
  }

  const nextCode = parsed.data.code?.trim().toUpperCase();
  const nextUsername = parsed.data.username?.trim().toLowerCase();
  const nextEmail = parsed.data.email === null ? null : parsed.data.email?.trim().toLowerCase();

  if (nextCode && nextCode !== cluster.code) {
    const exists = await prisma.cluster.findUnique({
      where: { code: nextCode },
      select: { id: true }
    });
    if (exists) {
      return badRequest("El código de cluster ya existe");
    }
  }

  if (nextUsername && nextUsername !== cluster.users[0]?.username) {
    const exists = await prisma.user.findUnique({
      where: { username: nextUsername },
      select: { id: true }
    });
    if (exists) {
      return badRequest("Username en uso");
    }
  }

  if (nextEmail !== undefined && nextEmail !== cluster.users[0]?.email) {
    if (nextEmail) {
      const exists = await prisma.user.findFirst({
        where: {
          email: nextEmail,
          id: { not: cluster.users[0]?.id || "__none__" }
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
    await tx.cluster.update({
      where: { id: cluster.id },
      data: {
        ...(nextCode ? { code: nextCode } : {}),
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {})
      }
    });

    const managerUser = cluster.users[0];
    if (managerUser) {
      await tx.user.update({
        where: { id: managerUser.id },
        data: {
          ...(nextUsername ? { username: nextUsername } : {}),
          ...(nextEmail !== undefined ? { email: nextEmail } : {}),
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
    action: "ADMIN_CLUSTER_UPDATED",
    userId: admin.uid,
    payload: {
      clusterId: cluster.id
    }
  });

  return Response.json({ ok: true });
}
