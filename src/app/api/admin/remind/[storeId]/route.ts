import { z } from "zod";
import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { canManagerAccessStore, requireManager } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  text: z.string().min(1).max(500).optional()
});

type Context = {
  params: Promise<{ storeId: string }>;
};

export async function POST(request: Request, context: Context) {
  const manager = await requireManager();
  if (!manager) {
    return unauthorized();
  }

  const { storeId } = await context.params;
  if (!(await canManagerAccessStore(manager, storeId))) {
    return forbidden();
  }
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
    "Recordatorio: por favor sube el contenido diario requerido en cuanto te sea posible. Gracias.";

  const msg = await prisma.message.create({
    data: {
      storeId,
      fromRole: manager.session.role,
      text
    }
  });

  await writeAuditLog({
    action: "MANAGER_REMINDER_SENT",
    userId: manager.session.uid,
    storeId,
    payload: { messageId: msg.id, fromRole: manager.session.role }
  });

  return Response.json({ ok: true, message: msg });
}
