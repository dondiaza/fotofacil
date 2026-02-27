"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ClusterRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  managerUser: { id: string; username: string; email: string | null } | null;
  stores: Array<{ id: string; storeCode: string; name: string; isActive: boolean }>;
};

type StoreRow = {
  id: string;
  storeCode: string;
  name: string;
  isActive: boolean;
  deadlineTime: string | null;
  cluster: { id: string; code: string; name: string } | null;
  user: { id: string; username: string; email: string | null } | null;
};

type OverviewResponse = {
  clusters: ClusterRow[];
  stores: StoreRow[];
};

type CsvSummary = {
  totalRows: number;
  createdClusters?: number;
  updatedClusters?: number;
  createdStores?: number;
  updatedStores?: number;
  createdUsers: number;
  updatedUsers: number;
  errors: string[];
};

async function parseJson(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function AdminAccountManager() {
  const [clusters, setClusters] = useState<ClusterRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [clusterCode, setClusterCode] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [clusterUsername, setClusterUsername] = useState("");
  const [clusterEmail, setClusterEmail] = useState("");
  const [clusterPassword, setClusterPassword] = useState("");
  const [clusterCreds, setClusterCreds] = useState<{ username: string; password: string } | null>(null);

  const [storeName, setStoreName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [storeUsername, setStoreUsername] = useState("");
  const [storeEmail, setStoreEmail] = useState("");
  const [storePassword, setStorePassword] = useState("");
  const [storeDeadline, setStoreDeadline] = useState("10:30");
  const [storeClusterId, setStoreClusterId] = useState<string>("");
  const [storeCreds, setStoreCreds] = useState<{ username: string; password: string } | null>(null);

  const [bulkAssignments, setBulkAssignments] = useState<Record<string, string>>({});
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [clusterResetDrafts, setClusterResetDrafts] = useState<Record<string, string>>({});
  const [storeResetDrafts, setStoreResetDrafts] = useState<Record<string, string>>({});

  const clusterOptions = useMemo(
    () =>
      clusters.map((cluster) => ({
        id: cluster.id,
        label: `${cluster.code} · ${cluster.name}`
      })),
    [clusters]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/accounts/overview", { cache: "no-store" });
      const json = (await parseJson(response)) as (OverviewResponse & { error?: string }) | null;
      if (!response.ok) {
        setError(json?.error || "No se pudo cargar cuentas");
        return;
      }
      setClusters(json?.clusters || []);
      setStores(json?.stores || []);
      setBulkAssignments(
        Object.fromEntries(((json?.stores as OverviewResponse["stores"]) || []).map((store) => [store.id, store.cluster?.id || ""]))
      );
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreateCluster = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setClusterCreds(null);
    try {
      const response = await fetch("/api/admin/accounts/clusters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: clusterCode,
          name: clusterName,
          username: clusterUsername,
          email: clusterEmail || undefined,
          password: clusterPassword || undefined
        })
      });
      const json = (await parseJson(response)) as { error?: string; credentials?: { username: string; password: string } } | null;
      if (!response.ok) {
        setError(json?.error || "No se pudo crear cluster");
        return;
      }

      setClusterCreds(json?.credentials || null);
      setNotice("Cluster creado");
      setClusterCode("");
      setClusterName("");
      setClusterUsername("");
      setClusterEmail("");
      setClusterPassword("");
      await load();
    } catch {
      setError("Error de conexión");
    }
  };

  const onCreateStore = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setStoreCreds(null);
    try {
      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeName,
          storeCode,
          clusterId: storeClusterId || undefined,
          username: storeUsername,
          email: storeEmail || undefined,
          password: storePassword || undefined,
          deadlineTime: storeDeadline || undefined
        })
      });
      const json = (await parseJson(response)) as { error?: string; credentials?: { username: string; password: string } } | null;
      if (!response.ok) {
        setError(json?.error || "No se pudo crear tienda");
        return;
      }
      setStoreCreds(json?.credentials || null);
      setNotice("Tienda creada");
      setStoreName("");
      setStoreCode("");
      setStoreUsername("");
      setStoreEmail("");
      setStorePassword("");
      setStoreClusterId("");
      await load();
    } catch {
      setError("Error de conexión");
    }
  };

  const patchCluster = async (
    clusterId: string,
    payload: Partial<{ code: string; name: string; username: string; email: string | null; isActive: boolean; resetPassword: string }>
  ) => {
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/accounts/clusters", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clusterId, ...payload })
    });
    const json = (await parseJson(response)) as { error?: string } | null;
    if (!response.ok) {
      setError(json?.error || "No se pudo actualizar cluster");
      return;
    }
    setNotice("Cluster actualizado");
    await load();
  };

  const patchStore = async (
    storeId: string,
    payload: Partial<{ name: string; username: string; email: string | null; clusterId: string | null; deadlineTime: string | null; isActive: boolean; resetPassword: string }>
  ) => {
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/accounts/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, ...payload })
    });
    const json = (await parseJson(response)) as { error?: string } | null;
    if (!response.ok) {
      setError(json?.error || "No se pudo actualizar tienda");
      return;
    }
    setNotice("Tienda actualizada");
    await load();
  };

  const resetClusterPassword = async (clusterId: string) => {
    const password = (clusterResetDrafts[clusterId] || "").trim();
    if (password.length < 8) {
      setError("La nueva contraseña de cluster debe tener al menos 8 caracteres");
      return;
    }
    await patchCluster(clusterId, { resetPassword: password });
    setClusterResetDrafts((prev) => ({ ...prev, [clusterId]: "" }));
  };

  const resetStorePassword = async (storeId: string) => {
    const password = (storeResetDrafts[storeId] || "").trim();
    if (password.length < 8) {
      setError("La nueva contraseña de tienda debe tener al menos 8 caracteres");
      return;
    }
    await patchStore(storeId, { resetPassword: password });
    setStoreResetDrafts((prev) => ({ ...prev, [storeId]: "" }));
  };

  const deleteCluster = async (clusterId: string, code: string) => {
    const confirmed = window.confirm(`Se eliminará el cluster ${code}. Sus tiendas quedarán sin cluster. ¿Continuar?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/accounts/clusters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clusterId })
    });
    const json = (await parseJson(response)) as { error?: string } | null;
    if (!response.ok) {
      setError(json?.error || "No se pudo eliminar cluster");
      return;
    }
    setNotice("Cluster eliminado");
    await load();
  };

  const deleteStore = async (storeId: string, storeCode: string) => {
    const confirmed = window.confirm(`Se eliminará la tienda ${storeCode} con sus datos asociados. ¿Continuar?`);
    if (!confirmed) {
      return;
    }
    setError(null);
    setNotice(null);
    const response = await fetch("/api/admin/accounts/stores", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId })
    });
    const json = (await parseJson(response)) as { error?: string } | null;
    if (!response.ok) {
      setError(json?.error || "No se pudo eliminar tienda");
      return;
    }
    setNotice("Tienda eliminada");
    await load();
  };

  const saveAssignments = async () => {
    setSavingAssignments(true);
    setError(null);
    setNotice(null);
    try {
      const payload = stores.map((store) => ({
        storeId: store.id,
        clusterId: bulkAssignments[store.id] || null
      }));
      const response = await fetch("/api/admin/accounts/stores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload })
      });
      const json = (await parseJson(response)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "No se pudieron guardar asignaciones");
        return;
      }
      setNotice("Asignaciones guardadas");
      await load();
    } catch {
      setError("Error de conexión");
    } finally {
      setSavingAssignments(false);
    }
  };

  const importCsv = async (type: "clusters" | "stores", file: File) => {
    setImportResult(null);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`/api/admin/import/${type}`, {
      method: "POST",
      body: form
    });
    const json = (await parseJson(response)) as { error?: string; summary?: CsvSummary } | null;
    if (!response.ok) {
      setError(json?.error || `No se pudo importar ${type}`);
      return;
    }
    const summary = (json?.summary as CsvSummary) || {
      totalRows: 0,
      createdUsers: 0,
      updatedUsers: 0,
      errors: []
    };
    setImportResult(
      `${type.toUpperCase()}: filas=${summary.totalRows}, creados=${summary.createdClusters ?? summary.createdStores ?? 0}, actualizados=${summary.updatedClusters ?? summary.updatedStores ?? 0}, errores=${summary.errors.length}`
    );
    await load();
  };

  return (
    <section className="space-y-4">
      {notice ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">{notice}</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <article className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={onCreateCluster} className="panel space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Crear cuenta Cluster</p>
          <input className="input" placeholder="Código cluster (ej. NORTE)" value={clusterCode} onChange={(e) => setClusterCode(e.target.value.toUpperCase())} required />
          <input className="input" placeholder="Nombre cluster" value={clusterName} onChange={(e) => setClusterName(e.target.value)} required />
          <input className="input" placeholder="Usuario cluster" value={clusterUsername} onChange={(e) => setClusterUsername(e.target.value.toLowerCase())} required />
          <input className="input" placeholder="Email cluster" value={clusterEmail} onChange={(e) => setClusterEmail(e.target.value)} />
          <input className="input" placeholder="Contraseña (opcional)" value={clusterPassword} onChange={(e) => setClusterPassword(e.target.value)} />
          {clusterCreds ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">Credenciales: {clusterCreds.username} / {clusterCreds.password}</p> : null}
          <button className="btn-primary h-10 w-full text-xs">Crear cluster</button>
        </form>

        <form onSubmit={onCreateStore} className="panel space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Crear cuenta Tienda</p>
          <input className="input" placeholder="Código tienda (ej. 043)" value={storeCode} onChange={(e) => setStoreCode(e.target.value.toUpperCase())} required />
          <input className="input" placeholder="Nombre tienda" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />
          <input className="input" placeholder="Usuario tienda" value={storeUsername} onChange={(e) => setStoreUsername(e.target.value.toLowerCase())} required />
          <input className="input" placeholder="Email tienda" value={storeEmail} onChange={(e) => setStoreEmail(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" type="time" value={storeDeadline} onChange={(e) => setStoreDeadline(e.target.value)} />
            <select className="input" value={storeClusterId} onChange={(e) => setStoreClusterId(e.target.value)}>
              <option value="">Sin cluster</option>
              {clusterOptions.map((cluster) => (
                <option key={cluster.id} value={cluster.id}>
                  {cluster.label}
                </option>
              ))}
            </select>
          </div>
          <input className="input" placeholder="Contraseña (opcional)" value={storePassword} onChange={(e) => setStorePassword(e.target.value)} />
          {storeCreds ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">Credenciales: {storeCreds.username} / {storeCreds.password}</p> : null}
          <button className="btn-primary h-10 w-full text-xs">Crear tienda</button>
        </form>
      </article>

      <article className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Vincular tiendas a clusters</p>
          <button onClick={() => void saveAssignments()} disabled={savingAssignments} className="btn-primary h-9 px-3 text-xs disabled:opacity-60">
            {savingAssignments ? "Guardando..." : "Guardar asignaciones"}
          </button>
        </div>
        {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
        <ul className="space-y-2">
          {stores.map((store) => (
            <li key={store.id} className="grid gap-2 rounded-xl border border-line px-3 py-2 md:grid-cols-[1fr_280px]">
              <div>
                <p className="text-sm font-semibold">
                  {store.storeCode} · {store.name}
                </p>
                <p className="text-xs text-muted">{store.user?.username || "-"} · {store.user?.email || "sin email"}</p>
              </div>
              <select
                className="input"
                value={bulkAssignments[store.id] || ""}
                onChange={(event) => setBulkAssignments((prev) => ({ ...prev, [store.id]: event.target.value }))}
              >
                <option value="">Sin cluster</option>
                {clusterOptions.map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      </article>

      <article className="grid gap-4 xl:grid-cols-2">
        <div className="panel p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Clusters y cuentas</p>
          <p className="mb-3 text-xs text-muted">Bloque exclusivo de gestores cluster (nombre, email, usuario y contraseña).</p>
          <ul className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {clusters.map((cluster) => (
              <li key={cluster.id} className="rounded-xl border border-line p-3">
                <div className="grid gap-2 md:grid-cols-[120px_1fr_1fr]">
                  <input
                    className="input"
                    defaultValue={cluster.code}
                    onBlur={(e) => void patchCluster(cluster.id, { code: e.target.value })}
                    title="Código cluster"
                  />
                  <input
                    className="input"
                    defaultValue={cluster.name}
                    onBlur={(e) => void patchCluster(cluster.id, { name: e.target.value })}
                    title="Nombre cluster"
                  />
                  <input
                    className="input"
                    defaultValue={cluster.managerUser?.username || ""}
                    onBlur={(e) => void patchCluster(cluster.id, { username: e.target.value })}
                    title="Usuario cluster"
                  />
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_1fr_120px]">
                  <input
                    className="input"
                    defaultValue={cluster.managerUser?.email || ""}
                    placeholder="Email cluster"
                    onBlur={(e) => void patchCluster(cluster.id, { email: e.target.value || null })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="input"
                      type="password"
                      value={clusterResetDrafts[cluster.id] || ""}
                      onChange={(e) => setClusterResetDrafts((prev) => ({ ...prev, [cluster.id]: e.target.value }))}
                      placeholder="Nueva contraseña"
                    />
                    <button onClick={() => void resetClusterPassword(cluster.id)} className="btn-ghost h-10 px-2 text-xs">
                      Guardar
                    </button>
                  </div>
                  <button
                    onClick={() => void patchCluster(cluster.id, { isActive: !cluster.isActive })}
                    className={`h-10 rounded-xl text-xs font-semibold ${cluster.isActive ? "bg-emerald-600 text-white" : "border border-line bg-white text-muted"}`}
                  >
                    {cluster.isActive ? "Activo" : "Inactivo"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">{cluster.stores.length} tienda(s) vinculadas</p>
                <button
                  onClick={() => void deleteCluster(cluster.id, cluster.code)}
                  className="mt-2 h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger"
                >
                  Eliminar cluster
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Tiendas y cuentas</p>
          <p className="mb-3 text-xs text-muted">Bloque de cuentas tienda (vinculación cluster, horario, usuario y contraseña).</p>
          <ul className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {stores.map((store) => (
              <li key={store.id} className="rounded-xl border border-line p-3">
                <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr]">
                  <input className="input" defaultValue={store.name} onBlur={(e) => void patchStore(store.id, { name: e.target.value })} />
                  <input
                    className="input"
                    defaultValue={store.user?.username || ""}
                    onBlur={(e) => void patchStore(store.id, { username: e.target.value })}
                  />
                  <input
                    className="input"
                    defaultValue={store.user?.email || ""}
                    onBlur={(e) => void patchStore(store.id, { email: e.target.value || null })}
                  />
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_160px_120px]">
                  <select
                    className="input"
                    defaultValue={store.cluster?.id || ""}
                    onChange={(e) => void patchStore(store.id, { clusterId: e.target.value || null })}
                  >
                    <option value="">Sin cluster</option>
                    {clusterOptions.map((cluster) => (
                      <option key={cluster.id} value={cluster.id}>
                        {cluster.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="time"
                    defaultValue={store.deadlineTime || "10:30"}
                    onBlur={(e) => void patchStore(store.id, { deadlineTime: e.target.value || null })}
                  />
                  <button
                    onClick={() => void patchStore(store.id, { isActive: !store.isActive })}
                    className={`h-10 rounded-xl text-xs font-semibold ${store.isActive ? "bg-emerald-600 text-white" : "border border-line bg-white text-muted"}`}
                  >
                    {store.isActive ? "Activa" : "Inactiva"}
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_120px]">
                  <input
                    className="input"
                    type="password"
                    value={storeResetDrafts[store.id] || ""}
                    onChange={(e) => setStoreResetDrafts((prev) => ({ ...prev, [store.id]: e.target.value }))}
                    placeholder="Nueva contraseña tienda"
                  />
                  <button onClick={() => void resetStorePassword(store.id)} className="btn-ghost h-10 px-3 text-xs">
                    Guardar clave
                  </button>
                </div>
                <button
                  onClick={() => void deleteStore(store.id, store.storeCode)}
                  className="mt-2 h-8 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-danger"
                >
                  Eliminar tienda
                </button>
              </li>
            ))}
          </ul>
        </div>
      </article>

      <article className="panel p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Importación CSV</p>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">Importar Clusters</p>
            <a className="text-xs font-semibold text-primary hover:underline" href="/api/admin/import/template?type=clusters">
              Descargar plantilla clusters
            </a>
            <label className="btn-ghost mt-2 h-10 w-full cursor-pointer text-xs">
              Seleccionar CSV clusters
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv("clusters", file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>

          <div className="rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">Importar Tiendas</p>
            <a className="text-xs font-semibold text-primary hover:underline" href="/api/admin/import/template?type=stores">
              Descargar plantilla tiendas
            </a>
            <label className="btn-ghost mt-2 h-10 w-full cursor-pointer text-xs">
              Seleccionar CSV tiendas
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsv("stores", file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {importResult ? <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-muted">{importResult}</p> : null}
      </article>
    </section>
  );
}
