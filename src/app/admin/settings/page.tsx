import { AppHeader } from "@/components/app-header";
import { AdminDriveSettings } from "@/components/admin-drive-settings";
import { AdminPasswordSettings } from "@/components/admin-password-settings";
import { AdminSmtpSettings } from "@/components/admin-smtp-settings";
import { requireAdminPage } from "@/lib/page-auth";

export default async function AdminSettingsPage() {
  await requireAdminPage();

  return (
    <main className="app-shell">
      <AppHeader
        title="Ajustes"
        subtitle="Configura Google Drive y correo SMTP para notificaciones"
        currentPath="/admin/settings"
        links={[
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/accounts", label: "Cuentas" },
          { href: "/admin/stores", label: "Tiendas" },
          { href: "/admin/media", label: "Biblioteca" },
          { href: "/admin/messages", label: "Mensajes" },
          { href: "/admin/settings", label: "Ajustes" }
        ]}
      />
      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Google Drive</p>
          <AdminDriveSettings />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Correo SMTP</p>
          <AdminSmtpSettings />
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Seguridad</p>
          <AdminPasswordSettings />
        </div>
      </section>
    </main>
  );
}
