import { AppHeader } from "@/components/app-header";
import { StoreUploadWizard } from "@/components/store-upload-wizard";
import { requireStorePage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";

export default async function StoreUploadPage() {
  const { store } = await requireStorePage();
  const unread = await prisma.message.count({
    where: {
      storeId: store.id,
      fromRole: "SUPERADMIN",
      readAt: null
    }
  });

  return (
    <main className="app-shell">
      <AppHeader
        title="Subir fotos del día"
        subtitle={`${store.name} · ${store.storeCode}`}
        currentPath="/store/upload"
        links={[
          { href: "/store", label: "Mi tienda" },
          { href: "/store/upload", label: "Subir fotos" },
          { href: "/store/history", label: "Historial" },
          { href: "/store/messages", label: unread ? `Mensajes (${unread})` : "Mensajes" }
        ]}
      />
      <StoreUploadWizard />
    </main>
  );
}
