import { AppHeader } from "@/components/app-header";
import { AdminAccountManager } from "@/components/admin-account-manager";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminAccountsPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Gestor de cuentas"
        subtitle="Usuarios de tiendas y clusters, vinculaciones e importación CSV"
        currentPath="/admin/accounts"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/accounts", label: "Cuentas" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminAccountManager />
    </main>
  );
}
