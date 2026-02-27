import { z } from "zod";
import bcrypt from "bcryptjs";
import { hashPassword } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  newPassword: z.string().min(8).max(128)
});

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

  const user = await prisma.user.findUnique({
    where: { id: admin.uid },
    select: {
      id: true,
      passwordHash: true
    }
  });

  if (!user) {
    return unauthorized();
  }

  const sameAsCurrent = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
  if (sameAsCurrent) {
    return badRequest("La nueva contraseña debe ser distinta de la actual");
  }

  const nextHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: nextHash,
      mustChangePw: false
    }
  });

  await writeAuditLog({
    action: "ADMIN_PASSWORD_CHANGED",
    userId: admin.uid
  });

  return Response.json({ ok: true });
}
