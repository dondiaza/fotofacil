import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function requireStorePage() {
  const session = await getSession();
  if (!session || session.role !== "STORE" || !session.storeId) {
    redirect("/login");
  }
  const store = await prisma.store.findUnique({
    where: { id: session.storeId }
  });
  if (!store || !store.isActive) {
    redirect("/login");
  }
  return { session, store };
}

export async function requireAdminPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    redirect("/login");
  }
  return session;
}
