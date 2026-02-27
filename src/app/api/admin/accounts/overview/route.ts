import { unauthorized } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/request-auth";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return unauthorized();
  }

  const [clusters, stores] = await Promise.all([
    prisma.cluster.findMany({
      orderBy: [{ code: "asc" }],
      include: {
        users: {
          where: { role: "CLUSTER" },
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        stores: {
          orderBy: [{ storeCode: "asc" }],
          select: {
            id: true,
            storeCode: true,
            name: true,
            isActive: true
          }
        }
      }
    }),
    prisma.store.findMany({
      orderBy: [{ storeCode: "asc" }],
      include: {
        cluster: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        users: {
          where: { role: "STORE" },
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    })
  ]);

  return Response.json({
    clusters: clusters.map((cluster) => ({
      id: cluster.id,
      code: cluster.code,
      name: cluster.name,
      isActive: cluster.isActive,
      managerUser: cluster.users[0] || null,
      stores: cluster.stores
    })),
    stores: stores.map((store) => ({
      id: store.id,
      storeCode: store.storeCode,
      name: store.name,
      isActive: store.isActive,
      deadlineTime: store.deadlineTime,
      cluster: store.cluster,
      user: store.users[0] || null
    }))
  });
}
