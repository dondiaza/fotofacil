import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { requireStorePage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";

export default async function StoreMessagesPage() {
  const { store } = await requireStorePage();
  const unread = await prisma.message.count({
    where: {
      storeId: store.id,
      NOT: { fromRole: "STORE" },
      readAt: null
    }
  });

  return (
    <main className="app-shell">
      <AppHeader
        title="Incidencias"
        subtitle={`${store.name} · ${store.storeCode}`}
        currentPath="/store/messages"
        links={[
          { href: "/store", label: "Mi tienda" },
          { href: "/store/upload", label: "Subir fotos" },
          { href: "/store/history", label: "Historial" },
          { href: "/store/messages", label: unread ? `Mensajes (${unread})` : "Mensajes" }
        ]}
      />
      <ChatPanel storeId={store.id} currentRole="STORE" title="Chat con Superadmin" />
    </main>
  );
}
