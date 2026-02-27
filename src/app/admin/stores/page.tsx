import { AppHeader } from "@/components/app-header";
import { AdminStoreManager } from "@/components/admin-store-manager";
import { AdminUploadRules } from "@/components/admin-upload-rules";
import { requireManagerPage } from "@/lib/page-auth";

export default async function AdminStoresPage() {
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
        title="Gestión de tiendas"
        subtitle="Alta, edición y configuración"
        currentPath="/admin/stores"
        links={links}
      />
      <section className="space-y-4">
        <AdminUploadRules managerRole={manager.role} managerClusterId={manager.clusterId} />
        <AdminStoreManager managerRole={manager.role} />
      </section>
    </main>
  );
}
