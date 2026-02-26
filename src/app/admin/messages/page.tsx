import { AppHeader } from "@/components/app-header";
import { AdminInbox } from "@/components/admin-inbox";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminMessagesPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Mensajería"
        subtitle="Bandeja de incidencias por tienda"
        currentPath="/admin/messages"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminInbox />
    </main>
  );
}
