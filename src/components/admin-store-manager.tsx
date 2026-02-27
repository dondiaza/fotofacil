"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/status-chip";

type StoreItem = {
  id: string;
  name: string;
  storeCode: string;
  isActive: boolean;
  todayStatus: "PENDING" | "PARTIAL" | "COMPLETE";
  deadlineTime: string;
  user: { username: string; email: string | null } | null;
};

type ManagerRole = "SUPERADMIN" | "CLUSTER";

export function AdminStoreManager({ managerRole }: { managerRole: ManagerRole }) {
  const [rows, setRows] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("10:30");
  const [globalSlots, setGlobalSlots] = useState("ESCAPARATE,FACHADA,INTERIOR,CAJA,GENERAL");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/stores?includeInactive=true", { cache: "no-store" });
      const json = await response.json();
      setRows(json.items || []);

      const globalResponse = await fetch("/api/admin/slot-templates", { cache: "no-store" });
      const globalJson = await globalResponse.json();
      const names = (globalJson.items || []).map((slot: { name: string }) => slot.name);
      if (names.length > 0) {
        setGlobalSlots(names.join(","));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setCreatedCredentials(null);
    try {
      const response = await fetch("/api/admin/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          storeCode,
          username,
          email: email || undefined,
          deadlineTime: deadlineTime || undefined
        })
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "No se pudo crear la tienda");
        return;
      }

      setCreatedCredentials(json.credentials);
      setName("");
      setStoreCode("");
      setUsername("");
      setEmail("");
      await load();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const onSaveGlobalSlots = async () => {
    setSavingGlobal(true);
    setGlobalMessage(null);
    try {
      const payload = globalSlots
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean)
        .map((item, index) => ({
              name: item,
              order: index + 1,
              required: true,
              allowMultiple: true
            }));

      const response = await fetch("/api/admin/slot-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots: payload })
      });
      const json = await response.json();
      if (!response.ok) {
        setGlobalMessage(json.error || "No se pudo guardar plantilla global");
        return;
      }
      setGlobalMessage("Plantilla global actualizada");
    } catch {
      setGlobalMessage("Error de conexión");
    } finally {
      setSavingGlobal(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        {managerRole === "SUPERADMIN" ? (
          <form onSubmit={onSubmit} className="panel space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Nueva tienda</p>
            <input required className="input" placeholder="Nombre tienda" value={name} onChange={(e) => setName(e.target.value)} />
            <input
              required
              className="input"
              placeholder="Store code (ej. 043)"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value.toUpperCase())}
            />
            <input
              required
              className="input"
              placeholder="Usuario login"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
            />
            <input className="input" placeholder="Email (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="input" type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
            {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
            {createdCredentials ? (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">
                Credenciales: {createdCredentials.username} / {createdCredentials.password}
              </p>
            ) : null}
            <button disabled={saving} className="btn-primary h-11 w-full disabled:opacity-60">
              {saving ? "Creando..." : "Crear tienda"}
            </button>
          </form>
        ) : (
          <article className="panel p-4 text-sm text-muted">
            Como <strong>Cluster</strong> puedes gestionar tus tiendas y validar contenido. El alta de tiendas queda reservada a superadmin.
          </article>
        )}

        {managerRole === "SUPERADMIN" ? (
          <article className="panel space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Plantilla global de slots</p>
            <textarea
              className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-primary"
              rows={4}
              value={globalSlots}
              onChange={(e) => setGlobalSlots(e.target.value)}
              placeholder="Slots globales separados por coma"
            />
            {globalMessage ? <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-muted">{globalMessage}</p> : null}
            <button onClick={onSaveGlobalSlots} disabled={savingGlobal} className="btn-ghost h-10 w-full disabled:opacity-60">
              {savingGlobal ? "Guardando..." : "Guardar plantilla global"}
            </button>
          </article>
        ) : null}
      </div>

      <article className="panel p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Tiendas</p>
        {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {row.storeCode} · {row.name}
                  </p>
                  <p className="text-xs text-muted">
                    {row.user?.username ?? "-"} · límite {row.deadlineTime} · {row.isActive ? "activa" : "inactiva"}
                  </p>
                </div>
                <StatusChip status={row.todayStatus} />
              </div>
              <Link href={`/admin/stores/${row.id}`} className="mt-2 inline-block text-xs font-semibold text-primary hover:underline">
                Abrir detalle
              </Link>
            </li>
          ))}
          {!loading && rows.length === 0 ? <li className="text-sm text-muted">Aún no hay tiendas.</li> : null}
        </ul>
      </article>
    </section>
  );
}
