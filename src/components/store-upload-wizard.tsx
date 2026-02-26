"use client";

import { useEffect, useMemo, useState } from "react";

type SlotItem = {
  name: string;
  required: boolean;
  allowMultiple: boolean;
  order: number;
  done: boolean;
  count: number;
  preview: string | null;
};

type DayView = {
  date: string;
  status: "PENDING" | "PARTIAL" | "COMPLETE";
  slots: SlotItem[];
  driveFolderId: string | null;
};

type UploadState = "idle" | "uploading" | "success" | "error";

function dateOffset(daysBack: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

async function readJsonSafe(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { error?: string } & Record<string, unknown>;
  } catch {
    return null;
  }
}

export function StoreUploadWizard() {
  const [dateKey, setDateKey] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileMap, setFileMap] = useState<Record<string, File | null>>({});
  const [uploadMap, setUploadMap] = useState<Record<string, UploadState>>({});

  const loadDay = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/today?date=${date}`);
      const json = await readJsonSafe(response);
      if (!response.ok) {
        setError((json as { error?: string } | null)?.error || "No se pudo cargar el día");
        return;
      }
      if (!json) {
        setError("Respuesta inválida del servidor");
        return;
      }
      setDayView(json as unknown as DayView);
      setUploadMap({});
      setFileMap({});
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDay(dateKey);
  }, [dateKey]);

  const previewUrls = useMemo(() => {
    const values: Record<string, string> = {};
    for (const [slot, file] of Object.entries(fileMap)) {
      if (!file) {
        continue;
      }
      values[slot] = URL.createObjectURL(file);
    }
    return values;
  }, [fileMap]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const completedSlots = useMemo(() => {
    if (!dayView) {
      return 0;
    }
    return dayView.slots.filter((slot) => slot.done || fileMap[slot.name]).length;
  }, [dayView, fileMap]);

  const requiredSlots = useMemo(() => dayView?.slots.filter((slot) => slot.required).length ?? 0, [dayView]);

  const pendingUploads = useMemo(() => {
    if (!dayView) {
      return [];
    }
    return dayView.slots.filter((slot) => fileMap[slot.name]);
  }, [dayView, fileMap]);

  const onPickFile = (slotName: string, file: File | null) => {
    setFileMap((prev) => ({
      ...prev,
      [slotName]: file
    }));
    setUploadMap((prev) => ({
      ...prev,
      [slotName]: "idle"
    }));
  };

  const uploadSlot = async (slotName: string, file: File) => {
    const formData = new FormData();
    formData.append("date", dateKey);
    formData.append("slotName", slotName);
    formData.append("file", file);

    setUploadMap((prev) => ({ ...prev, [slotName]: "uploading" }));

    const response = await fetch("/api/store/upload", {
      method: "POST",
      body: formData
    });
    const json = await readJsonSafe(response);
    if (!response.ok) {
      setUploadMap((prev) => ({ ...prev, [slotName]: "error" }));
      throw new Error((json as { error?: string } | null)?.error || `No se pudo subir la foto (${response.status})`);
    }
    setUploadMap((prev) => ({ ...prev, [slotName]: "success" }));
  };

  const onSend = async () => {
    if (!dayView || pendingUploads.length === 0) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      for (const slot of pendingUploads) {
        const file = fileMap[slot.name];
        if (!file) {
          continue;
        }
        await uploadSlot(slot.name, file);
      }
      await loadDay(dateKey);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loading || !dayView) {
    return <div className="panel p-4 text-sm text-muted">Cargando wizard...</div>;
  }

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Paso 0 · Fecha</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            className="input max-w-[190px]"
            value={dateKey}
            max={dateOffset(0)}
            min={dateOffset(7)}
            onChange={(event) => setDateKey(event.target.value)}
          />
          <span className="text-xs text-muted">Estado: {dayView.status}</span>
        </div>
      </article>

      <article className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Paso 1 · Captura</p>
          <p className="text-xs text-muted">
            {completedSlots}/{requiredSlots} requeridas
          </p>
        </div>

        <ul className="space-y-3">
          {dayView.slots.map((slot) => {
            const localPreview = previewUrls[slot.name] || null;
            const done = slot.done || Boolean(fileMap[slot.name]);
            const uploadState = uploadMap[slot.name] || "idle";

            return (
              <li key={slot.name} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{slot.name}</p>
                    <p className="text-xs text-muted">
                      {done ? "OK" : "Pendiente"} {slot.required ? "· Requerida" : "· Opcional"}
                    </p>
                  </div>
                  <span
                    className={`chip ${
                      uploadState === "error"
                        ? "bg-red-50 text-danger"
                        : uploadState === "success"
                          ? "bg-emerald-50 text-success"
                          : "bg-slate-100 text-muted"
                    }`}
                  >
                    {uploadState === "uploading"
                      ? "Subiendo..."
                      : uploadState === "success"
                        ? "Subido"
                        : uploadState === "error"
                          ? "Error"
                          : "Listo"}
                  </span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <label className="btn-primary h-10 cursor-pointer px-3 text-xs">
                    Hacer foto
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => onPickFile(slot.name, event.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
                    Repetir
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => onPickFile(slot.name, event.target.files?.[0] || null)}
                    />
                  </label>
                </div>

                {localPreview ? (
                  <div className="mt-3">
                    <img
                      src={localPreview}
                      alt={`Preview ${slot.name}`}
                      className="h-20 w-28 rounded-lg border border-line object-cover"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </article>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Paso 2 · Revisión</p>
        <ul className="mt-2 space-y-2 text-sm">
          {dayView.slots.map((slot) => (
            <li key={slot.name} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
              <span>{slot.name}</span>
              <span className={fileMap[slot.name] || slot.done ? "text-success" : "text-warning"}>
                {fileMap[slot.name] ? "Nueva foto lista" : slot.done ? "Ya subida" : "Falta"}
              </span>
            </li>
          ))}
        </ul>
        {error ? <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <button
          onClick={onSend}
          disabled={sending || pendingUploads.length === 0}
          className="btn-primary mt-3 h-11 w-full disabled:opacity-60"
        >
          {sending ? "Subiendo..." : pendingUploads.length === 0 ? "Sin cambios para enviar" : "Enviar"}
        </button>
      </article>
    </section>
  );
}
