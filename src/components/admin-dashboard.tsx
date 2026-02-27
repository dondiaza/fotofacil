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

type ClusterSummary = {
  id: string;
  code: string;
  name: string;
  stores: Array<{ id: string; storeCode: string; name: string; isActive: boolean }>;
};

type KpiRow = {
  storeId: string;
  storeCode: string;
  storeName: string;
  requiredDays: number;
  sentDays: number;
  sentOutOfDateDays: number;
  validatedFiles: number;
  totalFiles: number;
  incidents: number;
};

const filters = [
  { id: "ALL", label: "Todas" },
  { id: "PENDING", label: "Pendientes" },
  { id: "PARTIAL", label: "Parciales" },
  { id: "COMPLETE", label: "Completadas" }
] as const;

type DashboardRole = "SUPERADMIN" | "CLUSTER";

type AdminDashboardProps = {
  role: DashboardRole;
};

export function AdminDashboard({ role }: AdminDashboardProps) {
  const [rows, setRows] = useState<StoreRow[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [orphanStores, setOrphanStores] = useState<Array<{ id: string; storeCode: string; name: string; isActive: boolean }>>([]);
  const [clustersLoading, setClustersLoading] = useState(role === "SUPERADMIN");
  const [clustersError, setClustersError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay() || 7;
    now.setDate(now.getDate() - day + 1);
    return now.toISOString().slice(0, 10);
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("ALL");
  const [loading, setLoading] = useState(true);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [reminding, setReminding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === "ALL" ? "" : `?status=${filter}`;
      const params = new URLSearchParams(query ? query.slice(1) : "");
      params.set("date", selectedDate);
      const response = await fetch(`/api/admin/stores?${params.toString()}`, { cache: "no-store" });
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
  }, [filter, selectedDate]);

  const loadClusters = async () => {
    if (role !== "SUPERADMIN") {
      return;
    }
    setClustersLoading(true);
    setClustersError(null);
    try {
      const response = await fetch("/api/admin/accounts/overview", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setClustersError(json.error || "No se pudo cargar resumen de clusters");
        return;
      }
      const nextClusters = Array.isArray(json.clusters) ? (json.clusters as ClusterSummary[]) : [];
      const allStores = Array.isArray(json.stores) ? json.stores : [];
      setClusters(nextClusters);
      setOrphanStores(
        allStores
          .filter((store: { cluster: { id: string } | null }) => !store.cluster)
          .map((store: { id: string; storeCode: string; name: string; isActive: boolean }) => ({
            id: store.id,
            storeCode: store.storeCode,
            name: store.name,
            isActive: store.isActive
          }))
      );
    } catch {
      setClustersError("Error de conexión en resumen de clusters");
    } finally {
      setClustersLoading(false);
    }
  };

  useEffect(() => {
    void loadClusters();
  }, [role]);

  const loadKpis = async (targetWeekStart = weekStart) => {
    setLoadingKpis(true);
    setKpiError(null);
    try {
      const response = await fetch(`/api/admin/kpis?weekStart=${targetWeekStart}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) {
        setKpiError(json.error || "No se pudieron cargar KPIs");
        return;
      }
      setKpis(json.items || []);
    } catch {
      setKpiError("Error de conexión en KPIs");
    } finally {
      setLoadingKpis(false);
    }
  };

  useEffect(() => {
    void loadKpis(weekStart);
  }, [weekStart]);

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
      {role === "SUPERADMIN" ? (
        <article className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Clusters y tiendas</p>
            <button onClick={() => void loadClusters()} className="text-xs font-semibold text-primary hover:underline">
              Actualizar
            </button>
          </div>
          {clustersLoading ? <p className="text-sm text-muted">Cargando resumen...</p> : null}
          {clustersError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{clustersError}</p> : null}
          {!clustersLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {clusters.map((cluster) => (
                <article key={cluster.id} className="rounded-xl border border-line p-3">
                  <p className="text-sm font-semibold">
                    {cluster.code} · {cluster.name}
                  </p>
                  <p className="text-xs text-muted">{cluster.stores.length} tienda(s)</p>
                  <ul className="mt-2 space-y-1">
                    {cluster.stores.slice(0, 8).map((store) => (
                      <li key={store.id} className="truncate text-xs text-muted">
                        {store.storeCode} · {store.name}
                      </li>
                    ))}
                    {cluster.stores.length > 8 ? (
                      <li className="text-xs font-semibold text-primary">+{cluster.stores.length - 8} más</li>
                    ) : null}
                  </ul>
                </article>
              ))}
              {orphanStores.length > 0 ? (
                <article className="rounded-xl border border-dashed border-line p-3">
                  <p className="text-sm font-semibold">Sin cluster</p>
                  <p className="text-xs text-muted">{orphanStores.length} tienda(s)</p>
                  <ul className="mt-2 space-y-1">
                    {orphanStores.slice(0, 8).map((store) => (
                      <li key={store.id} className="truncate text-xs text-muted">
                        {store.storeCode} · {store.name}
                      </li>
                    ))}
                    {orphanStores.length > 8 ? (
                      <li className="text-xs font-semibold text-primary">+{orphanStores.length - 8} más</li>
                    ) : null}
                  </ul>
                </article>
              ) : null}
            </div>
          ) : null}
        </article>
      ) : null}

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
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
            className="input h-9 max-w-[170px]"
          />
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

      <article className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">KPIs por tienda (semanal)</p>
          <input
            type="date"
            value={weekStart}
            onChange={(event) => setWeekStart(event.target.value)}
            className="input h-9 max-w-[180px]"
          />
          <button onClick={() => void loadKpis(weekStart)} className="btn-ghost h-9 px-3 text-xs">
            Actualizar
          </button>
        </div>
        {loadingKpis ? <p className="text-sm text-muted">Cargando KPIs...</p> : null}
        {kpiError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{kpiError}</p> : null}
        {!loadingKpis ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.08em] text-muted">
                  <th className="px-2 py-2">Tienda</th>
                  <th className="px-2 py-2">Enviados</th>
                  <th className="px-2 py-2">Fuera de fecha</th>
                  <th className="px-2 py-2">Validados</th>
                  <th className="px-2 py-2">Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {kpis.map((item) => (
                  <tr key={item.storeId} className="border-t border-line">
                    <td className="px-2 py-2">
                      <p className="font-semibold">
                        {item.storeCode} · {item.storeName}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      {item.sentDays}/{item.requiredDays}
                    </td>
                    <td className="px-2 py-2">{item.sentOutOfDateDays}</td>
                    <td className="px-2 py-2">
                      {item.validatedFiles}/{item.totalFiles}
                    </td>
                    <td className="px-2 py-2">{item.incidents}</td>
                  </tr>
                ))}
                {!loadingKpis && kpis.length === 0 ? (
                  <tr>
                    <td className="px-2 py-3 text-sm text-muted" colSpan={5}>
                      Sin datos de KPI para esa semana.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </article>
    </section>
  );
}
