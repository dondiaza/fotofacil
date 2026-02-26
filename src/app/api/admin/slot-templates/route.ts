import { z } from "zod";
import { badRequest, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit";

const payloadSchema = z.object({
  slots: z.array(
    z.object({
      name: z.string().min(1),
      order: z.number().int().min(0),
      required: z.boolean().default(true),
      allowMultiple: z.boolean().default(false)
    })
  )
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const slots = await prisma.slotTemplate.findMany({
    where: { storeId: null },
    orderBy: { order: "asc" }
  });

  return Response.json({ items: slots });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid slots payload");
  }

  const names = parsed.data.slots.map((slot) => slot.name.trim().toUpperCase());
  if (new Set(names).size !== names.length) {
    return badRequest("slots contain duplicated names");
  }

  await prisma.$transaction(async (tx) => {
    await tx.slotTemplate.deleteMany({ where: { storeId: null } });
    if (parsed.data.slots.length > 0) {
      await tx.slotTemplate.createMany({
        data: parsed.data.slots.map((slot) => ({
          name: slot.name.trim().toUpperCase(),
          order: slot.order,
          required: slot.required,
          allowMultiple: slot.allowMultiple,
          storeId: null
        }))
      });
    }
  });

  await writeAuditLog({
    action: "ADMIN_GLOBAL_SLOTS_UPDATED",
    userId: admin.uid,
    payload: {
      count: parsed.data.slots.length
    }
  });

  return Response.json({ ok: true });
}
