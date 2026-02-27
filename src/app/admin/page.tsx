import { AppHeader } from "@/components/app-header";
import { AdminDashboard } from "@/components/admin-dashboard";
import { requireManagerPage } from "@/lib/page-auth";

export default async function AdminHomePage() {
  const manager = await requireManagerPage();
  const links = [
    { href: "/admin", label: "Dashboard" },
    ...(manager.role === "SUPERADMIN" ? [{ href: "/admin/accounts", label: "Cuentas" }] : []),
    { href: "/admin/stores", label: "Tiendas" },
    { href: "/admin/media", label: "Biblioteca" },
    { href: "/admin/messages", label: "Mensajes" }
  ];
  if (manager.role === "SUPERADMIN") {
    links.push({ href: "/admin/settings", label: "Ajustes" });
  }

  return (
    <main className="app-shell">
      <AppHeader
        title="Dashboard global"
        subtitle="Control diario de tiendas"
        currentPath="/admin"
        links={links}
      />
      <AdminDashboard />
    </main>
  );
}
