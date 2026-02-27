import { AppHeader } from "@/components/app-header";
import { AdminInbox } from "@/components/admin-inbox";
import { requireManagerPage } from "@/lib/page-auth";

export default async function AdminMessagesPage() {
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
        title="Mensajería"
        subtitle="Bandeja de incidencias por tienda"
        currentPath="/admin/messages"
        links={links}
      />
      <AdminInbox currentRole={manager.role} />
    </main>
  );
}
