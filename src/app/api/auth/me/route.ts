import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unauthorized } from "@/lib/http";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return unauthorized();
  }

  const user = await prisma.user.findUnique({
    where: { id: session.uid },
    include: { store: true, cluster: true }
  });

  if (!user) {
    return unauthorized();
  }

  return Response.json({
    user: {
      id: user.id,
      role: user.role,
      username: user.username,
      email: user.email,
      mustChangePw: user.mustChangePw,
      storeId: user.storeId,
      clusterId: user.clusterId
    },
    store: user.store
      ? {
          id: user.store.id,
          name: user.store.name,
        storeCode: user.store.storeCode,
        isActive: user.store.isActive
      }
      : null,
    cluster: user.cluster
      ? {
          id: user.cluster.id,
          name: user.cluster.name,
          code: user.cluster.code,
          isActive: user.cluster.isActive
        }
      : null
  });
}
