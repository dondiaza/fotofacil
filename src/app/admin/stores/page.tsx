import { AppHeader } from "@/components/app-header";
import { AdminStoreManager } from "@/components/admin-store-manager";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminStoresPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Gestión de tiendas"
        subtitle="Alta, edición y configuración"
        currentPath="/admin/stores"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminStoreManager />
    </main>
  );
}
