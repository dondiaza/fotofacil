import { AppHeader } from "@/components/app-header";
import { AdminDriveSettings } from "@/components/admin-drive-settings";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminSettingsPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Ajustes de Drive"
        subtitle="Vincula la carpeta raíz y define la estructura de alojamiento"
        currentPath="/admin/settings"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminDriveSettings />
    </main>
  );
}
