import { AppHeader } from "@/components/app-header";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminHomePage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Dashboard global"
        subtitle="Control diario de tiendas"
        currentPath="/admin"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminDashboard />
    </main>
  );
}
