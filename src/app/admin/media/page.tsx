import { AppHeader } from "@/components/app-header";
import { AdminMediaLibrary } from "@/components/admin-media-library";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminMediaPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Biblioteca de contenido"
        subtitle="Previsualiza, abre en galería y descarga por tienda/día"
        currentPath="/admin/media"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <AdminMediaLibrary />
    </main>
  );
}
