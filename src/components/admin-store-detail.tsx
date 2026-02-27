"use client";

import { FormEvent, useMemo, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";
import { StatusChip } from "@/components/status-chip";
import { parseResponseJson } from "@/lib/client-json";
import { driveFolderLink } from "@/lib/drive-links";

type DayItem = {
  id: string;
  date: string;
  status: "PENDING" | "PARTIAL" | "COMPLETE";
  driveFolderId: string | null;
  files: Array<{
    id: string;
    slotName: string;
    finalFilename: string;
    driveWebViewLink: string | null;
  }>;
};

type SlotItem = {
  id: string;
  name: string;
  order: number;
  required: boolean;
  allowMultiple: boolean;
};

type StoreDetail = {
  id: string;
  name: string;
  storeCode: string;
  isActive: boolean;
  deadlineTime: string | null;
  users: Array<{ username: string; email: string | null }>;
  slotTemplates: SlotItem[];
  uploadDays: DayItem[];
};

type ManagerRole = "CLUSTER" | "SUPERADMIN";

export function AdminStoreDetail({ initial, currentRole }: { initial: StoreDetail; currentRole: ManagerRole }) {
  const [item, setItem] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const slots = useMemo(() => {
    if (item.slotTemplates.length > 0) {
      return item.slotTemplates;
    }
    return [];
  }, [item.slotTemplates]);

  const onSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      deadlineTime: String(formData.get("deadlineTime") || "").trim() || null,
      isActive: formData.get("isActive") === "on"
    };

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/admin/stores/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await parseResponseJson<{ error?: string; item?: StoreDetail }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo actualizar");
        return;
      }
      if (!json?.item) {
        setError("No se recibió respuesta de actualización");
        return;
      }
      const rawDays = Array.isArray(json.item.uploadDays) ? json.item.uploadDays : [];
      const updated: StoreDetail = {
        ...json.item,
        uploadDays: rawDays.map((day) => ({
          ...day,
          date: String(day.date).slice(0, 10)
        }))
      };
      setItem(updated);
      setMessage("Cambios guardados");
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={onSave} className="panel space-y-3 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Datos de tienda</p>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Nombre</span>
            <input name="name" defaultValue={item.name} className="input" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Código</span>
            <input value={item.storeCode} disabled className="input bg-slate-50 text-muted" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted">Hora límite</span>
            <input name="deadlineTime" type="time" defaultValue={item.deadlineTime || "10:30"} className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="isActive" type="checkbox" defaultChecked={item.isActive} />
            Tienda activa
          </label>
          <p className="text-xs text-muted">
            Usuario: {item.users[0]?.username || "-"} ({item.users[0]?.email || "sin email"})
          </p>
          {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">{message}</p> : null}
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
          <button disabled={saving} className="btn-primary h-11 w-full disabled:opacity-60">
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </form>

        <article className="panel p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Slots esperados</p>
          <ul className="mt-2 space-y-2">
            {slots.length === 0 ? <li className="text-sm text-muted">Usando plantilla global.</li> : null}
            {slots.map((slot) => (
              <li key={slot.id} className="rounded-lg border border-line px-3 py-2 text-sm">
                {slot.name}
              </li>
            ))}
          </ul>
        </article>
      </aside>

      <div className="space-y-4">
        <article className="panel p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Estado por fecha (30 días)</p>
          <ul className="space-y-2">
            {item.uploadDays.map((day) => (
              <li key={day.id} className="rounded-xl border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{day.date}</p>
                    <p className="text-xs text-muted">{day.files.length} archivo(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={day.status} />
                    {day.driveFolderId ? (
                      <a
                        className="text-xs font-semibold text-primary hover:underline"
                        href={driveFolderLink(day.driveFolderId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Drive
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
            {item.uploadDays.length === 0 ? <li className="text-sm text-muted">Sin registros todavía.</li> : null}
          </ul>
        </article>

        <ChatPanel storeId={item.id} currentRole={currentRole} title="Chat con tienda" />
      </div>
    </section>
  );
}
