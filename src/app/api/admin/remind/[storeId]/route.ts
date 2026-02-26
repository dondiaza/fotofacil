import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  text: z.string().min(1).max(500).optional()
});

type Context = {
  params: Promise<{ storeId: string }>;
};

export async function POST(request: Request, context: Context) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const { storeId } = await context.params;
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) {
    return badRequest("Store not found");
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid payload");
  }

  const text =
    parsed.data.text ||
    "Recordatorio: por favor sube el set diario de fotos en cuanto te sea posible. Gracias.";

  const msg = await prisma.message.create({
    data: {
      storeId,
      fromRole: "SUPERADMIN",
      text
    }
  });

  await writeAuditLog({
    action: "ADMIN_REMINDER_SENT",
    userId: admin.uid,
    storeId,
    payload: { messageId: msg.id }
  });

  return Response.json({ ok: true, message: msg });
}
