"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StatusChip } from "@/components/status-chip";
import { driveFolderLink } from "@/lib/drive-links";

type StoreRow = {
  id: string;
  name: string;
  storeCode: string;
  deadlineTime: string;
  todayStatus: "PENDING" | "PARTIAL" | "COMPLETE";
  todayDriveFolderId: string | null;
  lastUploadAt: string | null;
  hasAlert: boolean;
  unreadMessages: number;
  user: { username: string; email: string | null } | null;
};

const filters = [
  { id: "ALL", label: "Todas" },
  { id: "PENDING", label: "Pendientes" },
  { id: "PARTIAL", label: "Parciales" },
  { id: "COMPLETE", label: "Completadas" }
] as const;

export function AdminDashboard() {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("ALL");
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === "ALL" ? "" : `?status=${filter}`;
      const response = await fetch(`/api/admin/stores${query}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "No se pudo cargar dashboard");
        return;
      }
      setRows(json.items || []);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const summary = useMemo(() => {
    return {
      all: rows.length,
      pending: rows.filter((x) => x.todayStatus === "PENDING").length,
      partial: rows.filter((x) => x.todayStatus === "PARTIAL").length,
      complete: rows.filter((x) => x.todayStatus === "COMPLETE").length
    };
  }, [rows]);

  const sendReminder = async (storeId: string) => {
    setReminding(storeId);
    await fetch(`/api/admin/remind/${storeId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    setReminding(null);
    await load();
  };

  return (
    <section className="space-y-4">
      <article className="grid gap-3 sm:grid-cols-4">
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Tiendas</p>
          <p className="mt-1 text-2xl font-semibold">{summary.all}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Pendientes</p>
          <p className="mt-1 text-2xl font-semibold text-warning">{summary.pending}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Parciales</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{summary.partial}</p>
        </div>
        <div className="panel p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-muted">Completadas</p>
          <p className="mt-1 text-2xl font-semibold text-success">{summary.complete}</p>
        </div>
      </article>

      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {filters.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setFilter(entry.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                filter === entry.id ? "bg-primary text-white" : "border border-line bg-white text-muted"
              }`}
            >
              {entry.label}
            </button>
          ))}
          <button onClick={() => void load()} className="ml-auto text-xs font-semibold text-primary hover:underline">
            Actualizar
          </button>
        </div>

        {loading ? <p className="text-sm text-muted">Cargando tiendas...</p> : null}
        {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {row.storeCode} · {row.name}
                  </p>
                  <p className="text-xs text-muted">
                    Usuario: {row.user?.username ?? "-"} · Límite: {row.deadlineTime}
                  </p>
                  {row.hasAlert ? (
                    <p className="mt-1 text-xs font-semibold text-danger">Alerta activa por no subida</p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <StatusChip status={row.todayStatus} />
                  {row.unreadMessages > 0 ? (
                    <span className="chip bg-amber-50 text-warning">{row.unreadMessages} sin leer</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void sendReminder(row.id)}
                  disabled={reminding === row.id}
                  className="btn-ghost h-9 px-3 text-xs disabled:opacity-60"
                >
                  {reminding === row.id ? "Enviando..." : "Enviar recordatorio"}
                </button>
                <Link href={`/admin/stores/${row.id}`} className="btn-primary h-9 px-3 text-xs">
                  Ver detalle
                </Link>
                {row.todayDriveFolderId ? (
                  <a
                    className="text-xs font-semibold text-primary hover:underline"
                    href={driveFolderLink(row.todayDriveFolderId)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir Drive hoy
                  </a>
                ) : null}
              </div>
            </li>
          ))}
          {!loading && rows.length === 0 ? <li className="text-sm text-muted">Sin resultados para este filtro.</li> : null}
        </ul>
      </article>
    </section>
  );
}
