import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, type SessionPayload } from "@/lib/session";

type ManagerRole = "SUPERADMIN" | "CLUSTER";
type ManagerSession = Omit<SessionPayload, "role"> & { role: ManagerRole };

export async function requireStorePage() {
  const session = await getSession();
  if (!session || session.role !== "STORE" || !session.storeId) {
    redirect("/login");
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
    redirect("/login");
  }
  return { session, store };
}

export async function requireManagerPage() {
  const session = await getSession();
  if (!session || (session.role !== "SUPERADMIN" && session.role !== "CLUSTER")) {
    redirect("/login");
  }
  if (session.role === "CLUSTER" && !session.clusterId) {
    redirect("/login");
  }
  return session as ManagerSession;
}

export async function requireAdminPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }
  return session;
}
