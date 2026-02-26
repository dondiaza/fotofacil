import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { AdminStoreDetail } from "@/components/admin-store-detail";
import { formatDateKey } from "@/lib/date";
import { requireAdminPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminStoreDetailPage(props: Props) {
  await requireAdminPage();
  const { id } = await props.params;

  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: "STORE" },
        select: { username: true, email: true }
      },
      slotTemplates: {
        where: { storeId: id },
        orderBy: { order: "asc" }
      },
      uploadDays: {
        orderBy: { date: "desc" },
        take: 30,
        include: {
          files: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              slotName: true,
              finalFilename: true,
              driveWebViewLink: true
            }
          }
        }
      }
    }
  });

  if (!store) {
    notFound();
  }

  const initial = {
    ...store,
    uploadDays: store.uploadDays.map((day) => ({
      ...day,
      date: formatDateKey(day.date)
    }))
  };

  return (
    <main className="app-shell">
      <AppHeader
        title={`${store.storeCode} · ${store.name}`}
        subtitle={<Link href="/admin/stores" className="text-primary hover:underline">Volver a tiendas</Link>}
        currentPath="/admin/stores"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminStoreDetail initial={initial} />
    </main>
  );
}
