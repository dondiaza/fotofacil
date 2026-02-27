import { AppHeader } from "@/components/app-header";
import { AdminMediaLibrary } from "@/components/admin-media-library";
import { requireManagerPage } from "@/lib/page-auth";

export default async function AdminMediaPage() {
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
        title="Biblioteca de contenido"
        subtitle="Previsualiza, abre en galería y descarga por tienda/día"
        currentPath="/admin/media"
        links={links}
      />
      <AdminMediaLibrary />
    </main>
  );
}
