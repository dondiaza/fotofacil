import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  smtpEnabled: z.boolean(),
  smtpHost: z.string().trim().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().optional(),
  smtpUser: z.string().trim().optional().nullable(),
  smtpPass: z.string().optional(),
  clearPassword: z.boolean().optional(),
  smtpFrom: z.string().trim().optional().nullable(),
  smtpReplyTo: z.string().trim().optional().nullable()
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const config = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      smtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      smtpFrom: true,
      smtpReplyTo: true
    }
  });

  return Response.json({
    item: {
      smtpEnabled: config?.smtpEnabled ?? false,
      smtpHost: config?.smtpHost ?? null,
      smtpPort: config?.smtpPort ?? 587,
      smtpSecure: config?.smtpSecure ?? false,
      smtpUser: config?.smtpUser ?? null,
      smtpFrom: config?.smtpFrom ?? null,
      smtpReplyTo: config?.smtpReplyTo ?? null,
      hasPassword: Boolean(config?.smtpPass)
    }
  });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  const data = parsed.data;
  if (data.smtpEnabled) {
    if (!data.smtpHost || !data.smtpPort || !data.smtpFrom) {
      return badRequest("Para activar SMTP: host, puerto y from son obligatorios");
    }
  }

  const existing = await prisma.appConfig.findUnique({
    where: { id: 1 },
    select: {
      smtpPass: true
    }
  });

  const nextPassword = data.clearPassword
    ? null
    : data.smtpPass !== undefined
      ? data.smtpPass.trim() || null
      : existing?.smtpPass || null;

  const updated = await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {
      smtpEnabled: data.smtpEnabled,
      smtpHost: data.smtpHost?.trim() || null,
      smtpPort: data.smtpPort ?? null,
      smtpSecure: data.smtpSecure ?? false,
      smtpUser: data.smtpUser?.trim() || null,
      smtpPass: nextPassword,
      smtpFrom: data.smtpFrom?.trim() || null,
      smtpReplyTo: data.smtpReplyTo?.trim() || null
    },
    create: {
      id: 1,
      smtpEnabled: data.smtpEnabled,
      smtpHost: data.smtpHost?.trim() || null,
      smtpPort: data.smtpPort ?? null,
      smtpSecure: data.smtpSecure ?? false,
      smtpUser: data.smtpUser?.trim() || null,
      smtpPass: nextPassword,
      smtpFrom: data.smtpFrom?.trim() || null,
      smtpReplyTo: data.smtpReplyTo?.trim() || null
    }
  });

  await writeAuditLog({
    action: "ADMIN_SMTP_UPDATED",
    userId: admin.uid,
    payload: {
      smtpEnabled: updated.smtpEnabled,
      smtpHost: updated.smtpHost,
      smtpPort: updated.smtpPort,
      smtpSecure: updated.smtpSecure,
      smtpUser: updated.smtpUser,
      smtpFrom: updated.smtpFrom,
      smtpReplyTo: updated.smtpReplyTo,
      hasPassword: Boolean(updated.smtpPass)
    }
  });

  return Response.json({
    ok: true,
    item: {
      smtpEnabled: updated.smtpEnabled,
      smtpHost: updated.smtpHost,
      smtpPort: updated.smtpPort,
      smtpSecure: updated.smtpSecure,
      smtpUser: updated.smtpUser,
      smtpFrom: updated.smtpFrom,
      smtpReplyTo: updated.smtpReplyTo,
      hasPassword: Boolean(updated.smtpPass)
    }
  });
}
