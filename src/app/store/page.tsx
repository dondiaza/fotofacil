import Link from "next/link";
import { subDays } from "date-fns";
import { AppHeader } from "@/components/app-header";
import { StoreLoginReminderPopup } from "@/components/store-login-reminder-popup";
import { StatusChip } from "@/components/status-chip";
import { formatDateKey, todayDateKey } from "@/lib/date";
import { requireStorePage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { getStoreDayView } from "@/lib/store-service";

export default async function StoreHomePage() {
  const { store } = await requireStorePage();
  const today = await getStoreDayView(store.id, store.clusterId ?? null, new Date());
  const history = await prisma.uploadDay.findMany({
    where: {
      storeId: store.id,
      date: {
        gte: subDays(new Date(), 30)
      }
    },
    orderBy: {
      date: "desc"
    },
    take: 14
  });

  const unread = await prisma.message.count({
    where: {
      storeId: store.id,
      NOT: { fromRole: "STORE" },
      readAt: null
    }
  });
  const loginReminders = await prisma.message.findMany({
    where: {
      storeId: store.id,
      fromRole: {
        in: ["CLUSTER", "SUPERADMIN"]
      },
      readAt: null,
      text: {
        contains: "recordatorio",
        mode: "insensitive"
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 5,
    select: {
      id: true,
      fromRole: true,
      text: true,
      createdAt: true
    }
  });
  const reminderItems = loginReminders.map((item) => ({
    id: item.id,
    fromRole: item.fromRole as "CLUSTER" | "SUPERADMIN",
    text: item.text,
    createdAt: item.createdAt.toISOString()
  }));

  return (
    <main className="app-shell">
      <AppHeader
        title={store.name}
        subtitle={`Código ${store.storeCode} · ${todayDateKey()}`}
        currentPath="/store"
        links={[
          { href: "/store", label: "Mi tienda" },
          { href: "/store/upload", label: "Subir fotos" },
          { href: "/store/history", label: "Historial" },
          { href: "/store/messages", label: unread ? `Mensajes (${unread})` : "Mensajes" }
        ]}
      />
      <StoreLoginReminderPopup items={reminderItems} />

      <section className="grid gap-3 sm:grid-cols-2">
        <article className="panel space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Estado del día</p>
          <div className="flex items-center justify-between">
            <StatusChip status={today.status} />
          </div>
          <Link href="/store/upload" className="btn-primary h-11 w-full">
            Subir fotos del día
          </Link>
        </article>

        <article className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Checklist de hoy</p>
          <ul className="mt-2 space-y-2">
            {today.slots.map((slot) => (
              <li
                key={slot.name}
                className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"
              >
                <span>{slot.name}</span>
                <span className={slot.done ? "text-success" : "text-warning"}>{slot.done ? "OK" : "Pendiente"}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="panel mt-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Últimos días</p>
          <Link href="/store/history" className="text-xs font-semibold text-primary hover:underline">
            Ver todo
          </Link>
        </div>
        <ul className="space-y-2">
          {history.length === 0 ? <li className="text-sm text-muted">Sin subidas recientes.</li> : null}
          {history.map((day) => (
            <li key={day.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm">
              <span>{formatDateKey(day.date)}</span>
              <StatusChip status={day.status} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
