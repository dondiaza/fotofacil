import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

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

export async function requireStore() {
  const session = await requireAuth();
  if (!session || session.role !== "STORE" || !session.storeId) {
    return null;
  }
  const store = await prisma.store.findUnique({
    where: { id: session.storeId }
  });
  if (!store || !store.isActive) {
    return null;
  }
  return { session, store };
}
