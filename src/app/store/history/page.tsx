import { subDays } from "date-fns";
import { AppHeader } from "@/components/app-header";
import { StatusChip } from "@/components/status-chip";
import { formatDateKey } from "@/lib/date";
import { driveFolderLink } from "@/lib/drive-links";
import { requireStorePage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";

export default async function StoreHistoryPage() {
  const { store } = await requireStorePage();

  const days = await prisma.uploadDay.findMany({
    where: {
      storeId: store.id,
      date: {
        gte: subDays(new Date(), 30)
      }
    },
    orderBy: {
      date: "desc"
    },
    include: {
      files: {
        select: { id: true }
      }
    }
  });

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
        title="Historial"
        subtitle={`${store.name} · Últimos 30 días`}
        currentPath="/store/history"
        links={[
          { href: "/store", label: "Mi tienda" },
          { href: "/store/upload", label: "Subir fotos" },
          { href: "/store/history", label: "Historial" },
          { href: "/store/messages", label: unread ? `Mensajes (${unread})` : "Mensajes" }
        ]}
      />

      <section className="panel p-4">
        <ul className="space-y-2">
          {days.length === 0 ? <li className="text-sm text-muted">No hay historial todavía.</li> : null}
          {days.map((day) => (
            <li key={day.id} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{formatDateKey(day.date)}</p>
                  <p className="text-xs text-muted">{day.files.length} archivo(s)</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusChip status={day.status} />
                  {day.driveFolderId ? (
                    <a
                      href={driveFolderLink(day.driveFolderId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Drive
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
