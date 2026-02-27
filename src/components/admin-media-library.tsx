"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { StatusChip } from "@/components/status-chip";
import { driveFilePreviewLink, driveFolderLink } from "@/lib/drive-links";
import { drawBoundsFromPoints, injectDrawAnnotation, pointsToSvgPath, splitDrawAnnotation, type DrawPoint } from "@/lib/draw-annotation";

type StoreLite = { id: string; name: string; storeCode: string };
type Role = "STORE" | "CLUSTER" | "SUPERADMIN";
type Requirement = "NONE" | "PHOTO" | "VIDEO" | "BOTH";
type FilterId = "PENDING_VALIDATION" | "WITH_COMMENTS" | "NOT_SENT" | "WITH_V2" | "PENDING_REPLY";

type MediaFile = {
  id: string;
  slotName: string;
  sequence: number;
  kind: "PHOTO" | "VIDEO";
  finalFilename: string;
  mimeType: string;
  driveFileId: string;
  bytes: number;
  versionGroupId: string;
  versionNumber: number;
  validatedAt: string | null;
  threadCount: number;
  unreadThreadCount: number;
  thumbUrl: string | null;
  downloadUrl: string;
};

type UploadDayPayload = {
  id: string;
  status: "PENDING" | "PARTIAL" | "COMPLETE";
  requirementKind: Requirement;
  isSent: boolean;
  driveFolderId: string | null;
  store: StoreLite;
  files: MediaFile[];
};

type MediaResponse = {
  date: string;
  stores: StoreLite[];
  selectedStoreId: string | null;
  uploadDay: UploadDayPayload | null;
};

type ThreadMessage = {
  id: string;
  authorRole: Role;
  text: string;
  createdAt: string;
  fileVersionNumber: number | null;
};

type ThreadItem = {
  id: string;
  zoneX: number | null;
  zoneY: number | null;
  zoneW: number | null;
  zoneH: number | null;
  resolvedAt: string | null;
  unreadCount: number;
  messages: ThreadMessage[];
};

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "PENDING_VALIDATION", label: "Pendiente de validar" },
  { id: "WITH_COMMENTS", label: "Con comentarios" },
  { id: "NOT_SENT", label: "No enviado" },
  { id: "WITH_V2", label: "Con V2" },
  { id: "PENDING_REPLY", label: "Pendiente de respuesta" }
];

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

async function parseJson(response: Response) {
  const raw = await response.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function roleLabel(role: Role) {
  if (role === "STORE") return "Tienda";
  if (role === "CLUSTER") return "Cluster";
  return "Admin";
}

export function AdminMediaLibrary() {
  const [date, setDate] = useState(todayDateInput());
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [payload, setPayload] = useState<MediaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeFilters, setActiveFilters] = useState<Set<FilterId>>(new Set());
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [busyValidateId, setBusyValidateId] = useState<string | null>(null);
  const [showUnreadPopup, setShowUnreadPopup] = useState(false);

  const [drawMode, setDrawMode] = useState(false);
  const [drawPathDraft, setDrawPathDraft] = useState<DrawPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [newThreadText, setNewThreadText] = useState("");
  const [draftByThread, setDraftByThread] = useState<Record<string, string>>({});
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const load = async (storeId?: string, day?: string) => {
    const currentDate = day ?? date;
    const currentStore = storeId ?? selectedStoreId;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date: currentDate });
      if (currentStore) params.set("storeId", currentStore);
      const response = await fetch(`/api/admin/media?${params.toString()}`, { cache: "no-store" });
      const json = (await parseJson(response)) as (MediaResponse & { error?: string }) | null;
      if (!response.ok || !json) {
        setError(json?.error || "No se pudo cargar biblioteca");
        return;
      }
      setPayload(json);
      if (json.selectedStoreId && json.selectedStoreId !== currentStore) {
        setSelectedStoreId(json.selectedStoreId);
      }
      setShowUnreadPopup((json.uploadDay?.files || []).some((file) => file.unreadThreadCount > 0));
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(selectedStoreId, date);
  }, [selectedStoreId, date]);

  const allFiles = payload?.uploadDay?.files ?? [];
  const filteredFiles = useMemo(() => {
    return allFiles.filter((file) => {
      if (activeFilters.has("NOT_SENT") && payload?.uploadDay?.isSent) return false;
      if (activeFilters.has("PENDING_VALIDATION") && file.validatedAt) return false;
      if (activeFilters.has("WITH_COMMENTS") && file.threadCount === 0) return false;
      if (activeFilters.has("WITH_V2") && file.versionNumber < 2) return false;
      if (activeFilters.has("PENDING_REPLY") && file.unreadThreadCount === 0) return false;
      return true;
    });
  }, [allFiles, payload?.uploadDay?.isSent, activeFilters]);

  const activeFile = galleryIndex === null ? null : filteredFiles[galleryIndex] || null;
  const unreadFiles = allFiles.filter((file) => file.unreadThreadCount > 0);

  const updateFile = (fileId: string, patch: Partial<MediaFile>) => {
    setPayload((prev) => {
      if (!prev?.uploadDay) return prev;
      return {
        ...prev,
        uploadDay: {
          ...prev.uploadDay,
          files: prev.uploadDay.files.map((item) => (item.id === fileId ? { ...item, ...patch } : item))
        }
      };
    });
  };

  const loadThreads = async (fileId: string, versionGroupId: string) => {
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const response = await fetch(`/api/media/threads?fileId=${fileId}`, { cache: "no-store" });
      const json = (await parseJson(response)) as { items?: ThreadItem[]; error?: string } | null;
      if (!response.ok || !json) {
        setThreadsError(json?.error || "No se pudieron cargar comentarios");
        return;
      }
      const items = json.items || [];
      setThreads(items);
      const unread = items.filter((item) => item.unreadCount > 0);
      if (unread.length > 0) {
        await Promise.all(unread.map((item) => fetch(`/api/media/threads/${item.id}/read`, { method: "POST" })));
        setPayload((prev) => {
          if (!prev?.uploadDay) return prev;
          return {
            ...prev,
            uploadDay: {
              ...prev.uploadDay,
              files: prev.uploadDay.files.map((item) =>
                item.versionGroupId === versionGroupId ? { ...item, unreadThreadCount: 0 } : item
              )
            }
          };
        });
      }
    } catch {
      setThreadsError("Error de conexión en comentarios");
    } finally {
      setThreadsLoading(false);
    }
  };

  const openGallery = (index: number) => {
    const file = filteredFiles[index];
    if (!file) return;
    setGalleryIndex(index);
    setThreads([]);
    setDrawMode(false);
    setDrawPathDraft([]);
    setDrawing(false);
    setNewThreadText("");
    void loadThreads(file.id, file.versionGroupId);
  };

  const pointerNorm = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = viewerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const onDrawDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawMode || !activeFile || activeFile.kind !== "PHOTO") return;
    const p = pointerNorm(event);
    if (!p) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrawing(true);
    setDrawPathDraft([p]);
  };

  const onDrawMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawMode || !drawing) return;
    const p = pointerNorm(event);
    if (!p) return;
    setDrawPathDraft((prev) => {
      if (prev.length === 0) return [p];
      const last = prev[prev.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (dx * dx + dy * dy < 0.00002) {
        return prev;
      }
      return [...prev, p];
    });
  };

  const onDrawUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onCreateThread = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeFile || !newThreadText.trim()) return;
    const bounds = drawBoundsFromPoints(drawPathDraft);
    const body: Record<string, unknown> = {
      fileId: activeFile.id,
      text: injectDrawAnnotation(newThreadText.trim(), drawPathDraft)
    };
    if (bounds) {
      Object.assign(body, bounds);
    }
    const response = await fetch("/api/media/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await parseJson(response);
    if (!response.ok) {
      setThreadsError((json as { error?: string } | null)?.error || "No se pudo crear hilo");
      return;
    }
    setNewThreadText("");
    setDrawMode(false);
    setDrawPathDraft([]);
    setDrawing(false);
    updateFile(activeFile.id, { threadCount: activeFile.threadCount + 1 });
    await loadThreads(activeFile.id, activeFile.versionGroupId);
  };

  const sendThreadReply = async (threadId: string) => {
    const text = (draftByThread[threadId] || "").trim();
    if (!text) return;
    const response = await fetch(`/api/media/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const json = await parseJson(response);
    if (!response.ok) {
      setThreadsError((json as { error?: string } | null)?.error || "No se pudo enviar respuesta");
      return;
    }
    setDraftByThread((prev) => ({ ...prev, [threadId]: "" }));
    if (activeFile) await loadThreads(activeFile.id, activeFile.versionGroupId);
  };

  const toggleValidation = async (file: MediaFile) => {
    setBusyValidateId(file.id);
    const response = await fetch(`/api/media/file/${file.id}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ validated: !file.validatedAt })
    });
    const json = await parseJson(response);
    if (!response.ok) {
      setThreadsError((json as { error?: string } | null)?.error || "No se pudo validar");
      setBusyValidateId(null);
      return;
    }
    updateFile(file.id, { validatedAt: file.validatedAt ? null : new Date().toISOString() });
    setBusyValidateId(null);
  };

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <div className="grid gap-2 lg:grid-cols-[1fr_180px]">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Tienda</span>
            <select className="input" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
              {(payload?.stores || []).map((store) => (
                <option key={store.id} value={store.id}>{store.storeCode} · {store.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Fecha</span>
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>
      </article>

      <article className="panel p-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                setActiveFilters((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                  return next;
                })
              }
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activeFilters.has(item.id) ? "bg-primary text-white" : "border border-line bg-white text-muted"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </article>

      {loading ? <p className="text-sm text-muted">Cargando biblioteca...</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {payload?.uploadDay ? (
        <article className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{payload.uploadDay.store.storeCode} · {payload.uploadDay.store.name}</p>
              <p className="text-xs text-muted">{payload.date} · {payload.uploadDay.isSent ? "Enviado" : "No enviado"} · Requerido {payload.uploadDay.requirementKind}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusChip status={payload.uploadDay.status} />
              <a className="btn-ghost h-9 px-3 text-xs" href={`/api/admin/media/pack?storeId=${selectedStoreId}&date=${payload.date}`}>Descargar pack</a>
              {payload.uploadDay.driveFolderId ? (
                <a className="btn-ghost h-9 px-3 text-xs" target="_blank" rel="noreferrer" href={driveFolderLink(payload.uploadDay.driveFolderId)}>
                  Abrir carpeta
                </a>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredFiles.map((file, index) => (
              <article key={file.id} className="rounded-xl border border-line p-3">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-slate-50">
                  {file.kind === "PHOTO" && file.thumbUrl ? (
                    <img src={file.thumbUrl} alt={file.finalFilename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">Vídeo / sin preview</div>
                  )}
                  {file.unreadThreadCount > 0 ? <span className="absolute right-2 top-2 chip bg-amber-500 text-white">{file.unreadThreadCount}</span> : null}
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{file.finalFilename}</p>
                <p className="text-xs text-muted">{file.slotName} · V{file.versionNumber} · {Math.round(file.bytes / 1024)} KB</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button onClick={() => openGallery(index)} className="btn-primary h-9 px-3 text-xs">Ver</button>
                  <button
                    onClick={() => void toggleValidation(file)}
                    disabled={busyValidateId === file.id}
                    className={`h-9 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${
                      file.validatedAt ? "bg-emerald-600 text-white" : "border border-line bg-white text-muted"
                    }`}
                  >
                    {file.validatedAt ? "Quitar check" : "Validar"}
                  </button>
                  <a href={file.downloadUrl} className="btn-ghost h-9 px-3 text-xs">Descargar</a>
                  <a href={driveFilePreviewLink(file.driveFileId)} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-xs">Drive</a>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : null}

      {showUnreadPopup && unreadFiles.length > 0 ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4">
          <article className="w-full max-w-lg rounded-xl bg-white p-4">
            <p className="text-sm font-semibold">Pendientes por leer</p>
            <ul className="mt-2 space-y-2">
              {unreadFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{file.finalFilename}</p>
                    <p className="text-xs text-muted">{file.unreadThreadCount} no leído(s)</p>
                  </div>
                  <button onClick={() => { const idx = filteredFiles.findIndex((x) => x.id === file.id); if (idx >= 0) openGallery(idx); setShowUnreadPopup(false); }} className="btn-primary h-8 px-3 text-xs">Abrir</button>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowUnreadPopup(false)} className="btn-ghost mt-3 h-9 w-full text-xs">Cerrar</button>
          </article>
        </div>
      ) : null}

      {activeFile ? (
        <div className="fixed inset-0 z-50 bg-slate-950/90 p-4">
          <div className="mx-auto grid h-full max-w-7xl gap-3 lg:grid-cols-[1fr_420px]">
            <article className="flex min-h-0 flex-col rounded-xl bg-white p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="truncate text-sm font-semibold">{activeFile.finalFilename}</p>
                <button onClick={() => setGalleryIndex(null)} className="btn-ghost h-8 px-2 text-xs">Cerrar</button>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <button onClick={() => setDrawMode((v) => !v)} className={`h-8 rounded-xl px-3 text-xs font-semibold ${drawMode ? "bg-primary text-white" : "border border-line bg-white text-muted"}`}>
                  {drawMode ? "Lápiz ON" : "Dibujar corrección"}
                </button>
                {drawPathDraft.length > 0 ? (
                  <button onClick={() => setDrawPathDraft([])} className="btn-ghost h-8 px-2 text-xs">Borrar trazo</button>
                ) : null}
                <button
                  onClick={() => void toggleValidation(activeFile)}
                  className={`h-8 rounded-xl px-2 text-xs font-semibold ${
                    activeFile.validatedAt ? "bg-emerald-600 text-white" : "border border-line bg-white text-muted"
                  }`}
                >
                  {activeFile.validatedAt ? "Quitar validación" : "Validar"}
                </button>
              </div>
              <div
                ref={viewerRef}
                className={`relative min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-slate-100 ${drawMode ? "cursor-crosshair touch-none" : ""}`}
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
                onPointerLeave={onDrawUp}
              >
                {activeFile.kind === "PHOTO" ? (
                  <img src={`https://drive.google.com/thumbnail?id=${activeFile.driveFileId}&sz=w2000`} alt={activeFile.finalFilename} className="mx-auto max-h-[75vh] w-auto object-contain" />
                ) : (
                  <video controls className="mx-auto max-h-[75vh] w-full"><source src={activeFile.downloadUrl} type={activeFile.mimeType} /></video>
                )}
                {threads.filter((thread) => thread.zoneX !== null && thread.zoneY !== null && thread.zoneW !== null && thread.zoneH !== null).map((thread) => (
                  <div key={thread.id} className={`pointer-events-none absolute border-2 ${thread.resolvedAt ? "border-emerald-500" : "border-amber-500"}`} style={{ left: `${(thread.zoneX || 0) * 100}%`, top: `${(thread.zoneY || 0) * 100}%`, width: `${(thread.zoneW || 0) * 100}%`, height: `${(thread.zoneH || 0) * 100}%` }} />
                ))}
                {threads.map((thread) => {
                  const firstMessage = thread.messages[0]?.text || "";
                  const points = splitDrawAnnotation(firstMessage).points;
                  const d = pointsToSvgPath(points);
                  if (!d) return null;
                  return (
                    <svg key={`path-${thread.id}`} viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                      <path
                        d={d}
                        fill="none"
                        stroke={thread.resolvedAt ? "#16a34a" : "#f59e0b"}
                        strokeWidth={1}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  );
                })}
                {drawPathDraft.length >= 2 ? (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                    <path d={pointsToSvgPath(drawPathDraft)} fill="none" stroke="#0f6cbd" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </div>
            </article>

            <aside className="flex min-h-0 flex-col rounded-xl bg-white p-3">
              <form onSubmit={onCreateThread} className="mb-3 space-y-2 rounded-lg border border-line bg-slate-50 p-2">
                <textarea className="w-full rounded-lg border border-line bg-white p-2 text-sm outline-none focus:border-primary" rows={3} value={newThreadText} onChange={(event) => setNewThreadText(event.target.value)} placeholder="Nuevo comentario del hilo..." />
                <p className="text-[11px] text-muted">
                  {drawPathDraft.length >= 2 ? "Se enviará con trazo dibujado" : "Opcional: activa “Dibujar corrección” y marca sobre la imagen."}
                </p>
                <button disabled={!newThreadText.trim()} className="btn-primary h-9 w-full text-xs">Crear hilo</button>
              </form>
              {threadsLoading ? <p className="text-sm text-muted">Cargando hilos...</p> : null}
              {threadsError ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{threadsError}</p> : null}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {threads.map((thread) => (
                  <article key={thread.id} className="rounded-lg border border-line p-2">
                    <button onClick={() => void fetch(`/api/media/threads/${thread.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !thread.resolvedAt }) }).then(() => activeFile && loadThreads(activeFile.id, activeFile.versionGroupId))} className="mb-2 text-xs font-semibold text-primary hover:underline">
                      {thread.resolvedAt ? "Reabrir hilo" : "Marcar resuelto"}
                    </button>
                    <div className="space-y-1">
                      {thread.messages.map((msg) => (
                        <div key={msg.id} className="rounded-lg bg-slate-100 px-2 py-1">
                          <p className="text-[11px] font-semibold text-muted">{roleLabel(msg.authorRole)} · {new Date(msg.createdAt).toLocaleString()} {msg.fileVersionNumber ? `· V${msg.fileVersionNumber}` : ""}</p>
                          <p className="whitespace-pre-wrap text-sm">{splitDrawAnnotation(msg.text).cleanText}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input className="input h-9" value={draftByThread[thread.id] || ""} onChange={(event) => setDraftByThread((prev) => ({ ...prev, [thread.id]: event.target.value }))} placeholder="Responder..." />
                      <button onClick={() => void sendThreadReply(thread.id)} className="btn-primary h-9 px-3 text-xs">Enviar</button>
                    </div>
                  </article>
                ))}
                {!threadsLoading && threads.length === 0 ? <p className="text-sm text-muted">Sin comentarios todavía.</p> : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
