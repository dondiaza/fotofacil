"use client";

import { useEffect, useMemo, useState } from "react";
import { toUserError, uploadVideoResumable } from "@/lib/client-video-upload";

type UploadState = "pending" | "uploading" | "done" | "error";
type Kind = "PHOTO" | "VIDEO";

type QueueItem = {
  id: string;
  file: File;
  kind: Kind;
  slotName: string;
  previewUrl: string | null;
  state: UploadState;
  error: string | null;
  hint: string | null;
};

type DaySlot = {
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
  isSent: boolean;
  requirementKind: "NONE" | "PHOTO" | "VIDEO" | "BOTH";
  missingKinds: Kind[];
  photoCount: number;
  videoCount: number;
  driveFolderId: string | null;
  slots: DaySlot[];
};

function dateOffset(daysBack: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date.toISOString().slice(0, 10);
}

function kindLabel(kind: DayView["requirementKind"]) {
  if (kind === "PHOTO") return "Foto";
  if (kind === "VIDEO") return "Video";
  if (kind === "BOTH") return "Foto + Video";
  return "Sin requerimiento";
}

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

function requirementMessage(dayView: DayView, queue: QueueItem[]) {
  const pending = queue.filter((item) => item.state !== "error");
  const pendingPhotos = pending.filter((item) => item.kind === "PHOTO").length;
  const pendingVideos = pending.filter((item) => item.kind === "VIDEO").length;

  const effectivePhotos = dayView.photoCount + pendingPhotos;
  const effectiveVideos = dayView.videoCount + pendingVideos;

  if (dayView.requirementKind === "PHOTO" && effectivePhotos < 1) {
    return "Hoy se requiere al menos 1 foto para completar el envío.";
  }
  if (dayView.requirementKind === "VIDEO" && effectiveVideos < 1) {
    return "Hoy se requiere al menos 1 vídeo para completar el envío.";
  }
  if (dayView.requirementKind === "BOTH") {
    if (effectivePhotos < 1 && effectiveVideos < 1) {
      return "Hoy se requiere al menos 1 foto y 1 vídeo.";
    }
    if (effectivePhotos < 1) {
      return "Falta al menos 1 foto para completar hoy.";
    }
    if (effectiveVideos < 1) {
      return "Falta al menos 1 vídeo para completar hoy.";
    }
  }
  return null;
}

function buildQueueItem(file: File, kind: Kind, slotName: string): QueueItem {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    file,
    kind,
    slotName,
    previewUrl: kind === "PHOTO" ? URL.createObjectURL(file) : null,
    state: "pending",
    error: null,
    hint: null
  };
}

export function StoreUploadWizard() {
  const [dateKey, setDateKey] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayView, setDayView] = useState<DayView | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState(true);
  const [additionalIndex, setAdditionalIndex] = useState(1);

  const loadDay = async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/today?date=${date}`, { cache: "no-store" });
      const json = await parseJson(response);
      if (!response.ok) {
        setError((json as { error?: string } | null)?.error || "No se pudo cargar el día");
        return;
      }
      setDayView(json as unknown as DayView);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDay(dateKey);
  }, [dateKey]);

  useEffect(() => {
    return () => {
      for (const item of queue) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, [queue]);

  const pendingItems = useMemo(() => queue.filter((item) => item.state !== "done"), [queue]);
  const missingRequirement = useMemo(() => (dayView ? requirementMessage(dayView, queue) : null), [dayView, queue]);

  const requiredSlots = useMemo(
    () => (dayView?.slots || []).filter((slot) => slot.required).sort((a, b) => a.order - b.order),
    [dayView]
  );

  const queuedPhotoCountsBySlot = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of queue) {
      if (item.kind === "PHOTO" && item.state !== "error") {
        counts[item.slotName] = (counts[item.slotName] || 0) + 1;
      }
    }
    return counts;
  }, [queue]);

  const nextRequiredSlot = useMemo(() => {
    for (const slot of requiredSlots) {
      const pending = queuedPhotoCountsBySlot[slot.name] || 0;
      if ((slot.count || 0) + pending < 1) {
        return slot.name;
      }
    }
    return null;
  }, [requiredSlots, queuedPhotoCountsBySlot]);

  const nextPhotoLabel = nextRequiredSlot || `ADICIONAL_${String(additionalIndex).padStart(2, "0")}`;

  const removeFromQueue = (id: string) => {
    setQueue((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const setItemState = (
    id: string,
    state: UploadState,
    errorMsg: string | null = null,
    hint: string | null = null
  ) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              state,
              error: errorMsg,
              hint
            }
          : item
      )
    );
  };

  const addGuidedPhotos = (files: FileList | null) => {
    if (!files || files.length === 0 || !dayView) {
      return;
    }

    const existingCounts: Record<string, number> = {};
    for (const slot of requiredSlots) {
      existingCounts[slot.name] = slot.count || 0;
    }
    for (const key of Object.keys(queuedPhotoCountsBySlot)) {
      existingCounts[key] = (existingCounts[key] || 0) + queuedPhotoCountsBySlot[key];
    }

    let nextAdditional = additionalIndex;
    const additions: QueueItem[] = [];
    for (const file of Array.from(files)) {
      let slotName = "";
      for (const slot of requiredSlots) {
        if ((existingCounts[slot.name] || 0) < 1) {
          slotName = slot.name;
          break;
        }
      }
      if (!slotName) {
        slotName = `ADICIONAL_${String(nextAdditional).padStart(2, "0")}`;
        nextAdditional += 1;
      }
      existingCounts[slotName] = (existingCounts[slotName] || 0) + 1;
      additions.push(buildQueueItem(file, "PHOTO", slotName));
    }

    setAdditionalIndex(nextAdditional);
    setQueue((prev) => [...prev, ...additions]);
  };

  const addVideos = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const additions = Array.from(files).map((file) => buildQueueItem(file, "VIDEO", "VIDEO"));
    setQueue((prev) => [...prev, ...additions]);
  };

  const uploadClassic = async (item: QueueItem) => {
    setItemState(item.id, "uploading");
    try {
      const formData = new FormData();
      formData.append("date", dateKey);
      formData.append("kind", item.kind);
      formData.append("slotName", item.slotName);
      formData.append("file", item.file);

      const response = await fetch("/api/store/upload", {
        method: "POST",
        body: formData
      });
      const json = await parseJson(response);
      if (!response.ok) {
        const msg = (json as { error?: string } | null)?.error || `Fallo de subida (${response.status})`;
        setItemState(item.id, "error", msg);
        throw new Error(msg);
      }
      setItemState(item.id, "done", null, "Subida completada");
    } catch (uploadError) {
      const msg = toUserError(uploadError, "Error de red al subir archivo");
      setItemState(item.id, "error", msg);
      throw uploadError;
    }
  };

  const uploadLargeVideo = async (item: QueueItem) => {
    setItemState(item.id, "uploading");
    try {
      const result = await uploadVideoResumable(item.file, {
        date: dateKey,
        slotName: item.slotName,
        onProgress: (progress) => {
          if (progress.phase === "optimizing") {
            setItemState(item.id, "uploading", null, "Optimizando vídeo...");
            return;
          }
          if (progress.phase === "uploading") {
            const pct = progress.totalBytes > 0 ? Math.max(1, Math.round((progress.uploadedBytes / progress.totalBytes) * 100)) : 0;
            setItemState(item.id, "uploading", null, `Subiendo vídeo... ${pct}%`);
            return;
          }
          setItemState(item.id, "uploading", null, "Finalizando vídeo...");
        }
      });

      setItemState(
        item.id,
        "done",
        null,
        result.optimized
          ? `Vídeo optimizado y enviado (${Math.round(result.usedFile.size / 1024)} KB)`
          : "Vídeo enviado"
      );
    } catch (uploadError) {
      const msg = toUserError(uploadError, "Error de red en subida de vídeo");
      setItemState(item.id, "error", msg);
      throw uploadError;
    }
  };

  const uploadItem = async (item: QueueItem) => {
    if (item.kind === "VIDEO") {
      return uploadLargeVideo(item);
    }
    return uploadClassic(item);
  };

  const onSendAll = async () => {
    if (pendingItems.length === 0) {
      return;
    }
    if (missingRequirement) {
      setError(missingRequirement);
      return;
    }
    setSending(true);
    setError(null);

    try {
      for (const item of pendingItems) {
        try {
          await uploadItem(item);
        } catch {
          // keeps processing the rest; each item stores its own error
        }
      }
      await loadDay(dateKey);
      const refreshed = await fetch(`/api/store/today?date=${dateKey}`, { cache: "no-store" });
      const refreshedJson = (await parseJson(refreshed)) as DayView | null;
      if (refreshed.ok && refreshedJson && !refreshedJson.isSent) {
        const requiredText =
          refreshedJson.requirementKind === "BOTH"
            ? "foto y vídeo"
            : refreshedJson.requirementKind === "PHOTO"
              ? "foto"
              : refreshedJson.requirementKind === "VIDEO"
                ? "vídeo"
                : "contenido";
        setError(`Subida finalizada, pero hoy sigue incompleto: falta ${requiredText}.`);
      }
    } finally {
      setSending(false);
    }
  };

  if (loading || !dayView) {
    return <div className="panel p-4 text-sm text-muted">Cargando subida...</div>;
  }

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Hoy toca</p>
        <p className="mt-1 text-lg font-semibold">{kindLabel(dayView.requirementKind)}</p>
        <p className="text-sm text-muted">
          Estado: <strong>{dayView.isSent ? "Enviado" : "No enviado"}</strong> · Fotos {dayView.photoCount} · Videos {dayView.videoCount}
        </p>
      </article>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Fecha</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            className="input max-w-[190px]"
            value={dateKey}
            max={dateOffset(0)}
            min={dateOffset(7)}
            onChange={(event) => setDateKey(event.target.value)}
          />
          <span className="text-xs text-muted">Ventana de 7 días</span>
        </div>
      </article>

      <article className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Captura guiada</p>
          <button
            onClick={() => setGuidedMode((prev) => !prev)}
            className={`h-8 rounded-xl px-3 text-xs font-semibold ${guidedMode ? "bg-primary text-white" : "border border-line bg-white text-muted"}`}
          >
            {guidedMode ? "Finalizar proceso" : "Iniciar proceso"}
          </button>
        </div>
        {guidedMode ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              Siguiente título: <strong>{nextPhotoLabel}</strong>
            </p>
            {nextRequiredSlot ? (
              <p className="text-xs text-muted">
                Captura en orden de requeridas. Cuando completes todas, las nuevas quedarán como adicionales.
              </p>
            ) : (
              <p className="text-xs text-muted">Requeridas completas. Puedes seguir capturando fotos adicionales.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="btn-primary h-10 cursor-pointer px-3 text-xs">
                Capturar siguiente
                <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => addGuidedPhotos(event.target.files)} />
              </label>
              <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
                Subir archivo foto
                <input hidden type="file" accept="image/*" onChange={(event) => addGuidedPhotos(event.target.files)} />
              </label>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Activa el proceso guiado para capturar una tras otra con el título requerido.</p>
        )}
      </article>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Vídeos</p>
        <p className="text-sm text-muted">Puedes añadir vídeos en cualquier momento.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
            Añadir vídeo cámara
            <input hidden type="file" accept="video/*" capture="environment" onChange={(event) => addVideos(event.target.files)} />
          </label>
          <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
            Añadir vídeo archivo
            <input hidden type="file" accept="video/*" onChange={(event) => addVideos(event.target.files)} />
          </label>
        </div>
      </article>

      <article className="panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Pendientes</p>
          <p className="text-xs text-muted">{pendingItems.length} por enviar</p>
        </div>

        {queue.length === 0 ? <p className="text-sm text-muted">No hay elementos en cola.</p> : null}
        {missingRequirement ? <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-warning">{missingRequirement}</p> : null}

        <ul className="space-y-2">
          {queue.map((item) => (
            <li key={item.id} className="rounded-xl border border-line px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="truncate text-sm font-semibold">{item.file.name}</p>
                  <p className="text-xs text-muted">
                    {item.kind === "PHOTO" ? "Foto" : "Vídeo"} · {item.slotName} · {Math.round(item.file.size / 1024)} KB
                  </p>
                  {item.hint ? <p className="text-xs text-muted">{item.hint}</p> : null}
                  {item.error ? <p className="text-xs font-semibold text-danger">{item.error}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`chip ${
                      item.state === "done"
                        ? "bg-emerald-50 text-success"
                        : item.state === "error"
                          ? "bg-red-50 text-danger"
                          : item.state === "uploading"
                            ? "bg-sky-50 text-primary"
                            : "bg-slate-100 text-muted"
                    }`}
                  >
                    {item.state === "done"
                      ? "Enviado"
                      : item.state === "error"
                        ? "Error"
                        : item.state === "uploading"
                          ? "Subiendo"
                          : "Pendiente"}
                  </span>
                  {item.state !== "uploading" ? (
                    <button onClick={() => removeFromQueue(item.id)} className="btn-ghost h-8 px-2 text-xs">
                      Quitar
                    </button>
                  ) : null}
                </div>
              </div>
              {item.previewUrl ? (
                <div className="mt-2">
                  <img src={item.previewUrl} alt={item.file.name} className="h-24 w-32 rounded-lg border border-line object-cover" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

        <button
          onClick={onSendAll}
          disabled={sending || pendingItems.length === 0 || Boolean(missingRequirement)}
          className="btn-primary mt-3 h-11 w-full disabled:opacity-60"
        >
          {sending ? "Subiendo..." : pendingItems.length === 0 ? "Sin elementos para enviar" : "Enviar todo"}
        </button>
      </article>
    </section>
  );
}
