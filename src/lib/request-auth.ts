import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/session";

export type ManagerAuth = {
  session: SessionPayload;
  isSuperAdmin: boolean;
  clusterId: string | null;
};

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if (!session || session.role !== "SUPERADMIN") {
    return null;
  }
  return session;
}

export async function requireManager(): Promise<ManagerAuth | null> {
  const session = await requireAuth();
  if (!session) {
    return null;
  }

  if (session.role === "SUPERADMIN") {
    return {
      session,
      isSuperAdmin: true,
      clusterId: null
    };
  }

  if (session.role !== "CLUSTER" || !session.clusterId) {
    return null;
  }

  const cluster = await prisma.cluster.findUnique({
    where: { id: session.clusterId },
    select: { id: true, isActive: true }
  });
  if (!cluster || !cluster.isActive) {
    return null;
  }

  return {
    session,
    isSuperAdmin: false,
    clusterId: cluster.id
  };
}

export async function requireStore() {
  const session = await requireAuth();
  if (!session || session.role !== "STORE" || !session.storeId) {
    return null;
  }
  const store = await prisma.store.findUnique({
    where: { id: session.storeId },
    include: {
      cluster: {
        select: { id: true, name: true, code: true, isActive: true }
      }
    }
  });
  if (!store || !store.isActive) {
    return null;
  }
  return { session, store };
}

export async function canManagerAccessStore(manager: ManagerAuth, storeId: string) {
  if (manager.isSuperAdmin) {
    return true;
  }
  const count = await prisma.store.count({
    where: {
      id: storeId,
      clusterId: manager.clusterId
    }
  });
  return count > 0;
}

export async function canSessionAccessStore(session: SessionPayload, storeId: string) {
  if (session.role === "SUPERADMIN") {
    return true;
  }

  if (session.role === "STORE") {
    return session.storeId === storeId;
  }

  if (session.role === "CLUSTER" && session.clusterId) {
    const count = await prisma.store.count({
      where: {
        id: storeId,
        clusterId: session.clusterId
      }
    });
    return count > 0;
  }

  return false;
}

export function storeScopeWhere(manager: ManagerAuth) {
  if (manager.isSuperAdmin) {
    return {};
  }
  return { clusterId: manager.clusterId };
}
