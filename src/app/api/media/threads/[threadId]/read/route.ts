import { badRequest, forbidden, unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/request-auth";
import { assertSessionStoreAccess, getThreadAccess } from "@/lib/media-access";

type Context = {
  params: Promise<{ threadId: string }>;
};

export async function POST(_: Request, context: Context) {
  const session = await requireAuth();
  if (!session) {
    return unauthorized();
  }

  const { threadId } = await context.params;
  const thread = await getThreadAccess(threadId);
  if (!thread) {
    return badRequest("Hilo no encontrado");
  }

  const allowed = await assertSessionStoreAccess(session, thread.storeId);
  if (!allowed) {
    return forbidden();
  }

  const now = new Date();
  await prisma.mediaThreadRead.upsert({
    where: {
      threadId_userId: {
        threadId,
        userId: session.uid
      }
    },
    create: {
      threadId,
      userId: session.uid,
      lastReadAt: now
    },
    update: {
      lastReadAt: now
    }
  });

  return Response.json({ ok: true, readAt: now });
}
