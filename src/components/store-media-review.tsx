"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { StatusChip } from "@/components/status-chip";
import { toUserError, uploadVideoResumable } from "@/lib/client-video-upload";
import { drawBoundsFromPoints, injectDrawAnnotation, pointsToSvgPath, splitDrawAnnotation, type DrawPoint } from "@/lib/draw-annotation";

type Role = "STORE" | "CLUSTER" | "SUPERADMIN";

type StoreFile = {
  id: string;
  slotName: string;
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
  versions: Array<{
    id: string;
    versionNumber: number;
    kind: "PHOTO" | "VIDEO";
    finalFilename: string;
    mimeType: string;
    driveFileId: string;
    bytes: number;
    createdAt: string;
    thumbUrl: string | null;
    downloadUrl: string;
  }>;
};

type StoreMediaPayload = {
  date: string;
  uploadDay: {
    id: string;
    status: "PENDING" | "PARTIAL" | "COMPLETE";
    isSent: boolean;
    requirementKind: "NONE" | "PHOTO" | "VIDEO" | "BOTH";
    driveFolderId: string | null;
    files: StoreFile[];
  } | null;
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

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function StoreMediaReview() {
  const [date, setDate] = useState(todayInput());
  const [payload, setPayload] = useState<StoreMediaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showUnreadPopup, setShowUnreadPopup] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [newThreadText, setNewThreadText] = useState("");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [drawMode, setDrawMode] = useState(false);
  const [drawPathDraft, setDrawPathDraft] = useState<DrawPoint[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);

  const files = payload?.uploadDay?.files || [];
  const activeFile = galleryIndex === null ? null : files[galleryIndex] || null;
  const activeVersion =
    activeFile?.versions.find((version) => version.id === selectedVersionId) ||
    activeFile?.versions[activeFile.versions.length - 1] ||
    null;
  const unreadFiles = files.filter((item) => item.unreadThreadCount > 0);

  const load = async (day?: string) => {
    const target = day ?? date;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/media?date=${target}`, { cache: "no-store" });
      const json = (await parseJson(response)) as (StoreMediaPayload & { error?: string }) | null;
      if (!response.ok || !json) {
        setError(json?.error || "No se pudo cargar enviados");
        return null;
      }
      setPayload(json);
      setShowUnreadPopup((json.uploadDay?.files || []).some((file) => file.unreadThreadCount > 0));
      return json;
    } catch {
      setError("Error de conexión");
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(date);
  }, [date]);

  const updateFile = (fileId: string, patch: Partial<StoreFile>) => {
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

  const loadThreads = async (file: StoreFile) => {
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const response = await fetch(`/api/media/threads?fileId=${file.id}`, { cache: "no-store" });
      const json = (await parseJson(response)) as { items?: ThreadItem[]; error?: string } | null;
      if (!response.ok || !json) {
        setThreadsError(json?.error || "No se pudieron cargar comentarios");
        return;
      }
      setThreads(json.items || []);
      const unread = (json.items || []).filter((item) => item.unreadCount > 0);
      if (unread.length > 0) {
        await Promise.all(unread.map((item) => fetch(`/api/media/threads/${item.id}/read`, { method: "POST" })));
        setPayload((prev) => {
          if (!prev?.uploadDay) return prev;
          return {
            ...prev,
            uploadDay: {
              ...prev.uploadDay,
              files: prev.uploadDay.files.map((entry) =>
                entry.versionGroupId === file.versionGroupId ? { ...entry, unreadThreadCount: 0 } : entry
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
    const file = files[index];
    if (!file) return;
    setGalleryIndex(index);
    setThreads([]);
    setThreadsError(null);
    setDrawMode(false);
    setDrawPathDraft([]);
    setDrawing(false);
    setNewThreadText("");
    setReplaceFile(null);
    setSelectedVersionId(file.id);
    void loadThreads(file);
  };

  const closeGallery = () => {
    setGalleryIndex(null);
    setThreads([]);
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
    const linkedFileId = activeVersion?.id || activeFile.id;
    const bounds = drawBoundsFromPoints(drawPathDraft);
    const body: Record<string, unknown> = {
      fileId: linkedFileId,
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
    await loadThreads(activeFile);
  };

  const onSendReply = async (threadId: string) => {
    const text = (replyDraft[threadId] || "").trim();
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
    setReplyDraft((prev) => ({ ...prev, [threadId]: "" }));
    if (activeFile) await loadThreads(activeFile);
  };

  const onReplace = async () => {
    if (!activeFile || !replaceFile) return;
    setReplacing(true);
    setThreadsError(null);
    try {
      if (activeFile.kind === "VIDEO") {
        await uploadVideoResumable(replaceFile, {
          date,
          slotName: activeFile.slotName,
          replaceFileId: activeFile.id
        });
      } else {
        const form = new FormData();
        form.append("date", date);
        form.append("kind", activeFile.kind);
        form.append("file", replaceFile);
        form.append("replaceFileId", activeFile.id);
        const response = await fetch("/api/store/upload", { method: "POST", body: form });
        const json = await parseJson(response);
        if (!response.ok) {
          setThreadsError((json as { error?: string } | null)?.error || "No se pudo subir V2");
          setReplacing(false);
          return;
        }
      }
    } catch (error) {
      setThreadsError(toUserError(error, "No se pudo subir V2 por error de red"));
      setReplacing(false);
      return;
    }

    setReplacing(false);
    const refreshed = await load(date);
    const reloadedFiles = refreshed?.uploadDay?.files || [];
    const nextIndex = reloadedFiles.findIndex((entry) => entry.versionGroupId === activeFile.versionGroupId);
    if (nextIndex >= 0) {
      const file = reloadedFiles[nextIndex];
      setGalleryIndex(nextIndex);
      setSelectedVersionId(file.id);
      setThreads([]);
      setDrawMode(false);
      setDrawPathDraft([]);
      setDrawing(false);
      setNewThreadText("");
      setReplaceFile(null);
      void loadThreads(file);
    } else {
      closeGallery();
    }
  };

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">Enviados y comentarios</p>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" className="input max-w-[190px]" value={date} onChange={(event) => setDate(event.target.value)} />
          <button onClick={() => void load(date)} className="btn-ghost h-10 px-3 text-xs">Actualizar</button>
          {payload?.uploadDay ? <StatusChip status={payload.uploadDay.status} /> : null}
        </div>
      </article>

      {loading ? <p className="text-sm text-muted">Cargando contenido...</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {payload?.uploadDay ? (
        <article className="panel p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            {payload.date} · {payload.uploadDay.isSent ? "Enviado" : "No enviado"} · Requerido {payload.uploadDay.requirementKind}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {files.map((file, index) => (
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
                <p className="text-xs text-muted">V{file.versionNumber} · {file.validatedAt ? "Validado" : "No validado"}</p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => openGallery(index)} className="btn-primary h-9 px-3 text-xs">Abrir</button>
                  <a href={file.downloadUrl} className="btn-ghost h-9 px-3 text-xs">Descargar</a>
                </div>
              </article>
            ))}
          </div>
          {files.length === 0 ? <p className="text-sm text-muted">Sin archivos para este día.</p> : null}
        </article>
      ) : !loading ? (
        <article className="panel p-4 text-sm text-muted">No hay subidas para la fecha seleccionada.</article>
      ) : null}

      {showUnreadPopup && unreadFiles.length > 0 ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4">
          <article className="w-full max-w-lg rounded-xl bg-white p-4">
            <p className="text-sm font-semibold">Tienes comentarios sin leer</p>
            <ul className="mt-2 space-y-2">
              {unreadFiles.map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <div>
                    <p className="text-sm font-semibold">{file.finalFilename}</p>
                    <p className="text-xs text-muted">{file.unreadThreadCount} no leído(s)</p>
                  </div>
                  <button onClick={() => { const idx = files.findIndex((x) => x.id === file.id); if (idx >= 0) openGallery(idx); setShowUnreadPopup(false); }} className="btn-primary h-8 px-3 text-xs">Abrir</button>
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
                <button onClick={closeGallery} className="btn-ghost h-8 px-2 text-xs">Cerrar</button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button onClick={() => setDrawMode((v) => !v)} className={`h-8 rounded-xl px-3 text-xs font-semibold ${drawMode ? "bg-primary text-white" : "border border-line bg-white text-muted"}`}>
                  {drawMode ? "Lápiz ON" : "Dibujar corrección"}
                </button>
                {drawPathDraft.length > 0 ? (
                  <button onClick={() => setDrawPathDraft([])} className="btn-ghost h-8 px-3 text-xs">
                    Borrar trazo
                  </button>
                ) : null}
                <label className="btn-ghost h-8 cursor-pointer px-3 text-xs">
                  V2 archivo
                  <input hidden type="file" accept={activeFile.kind === "PHOTO" ? "image/*" : "video/*"} onChange={(event) => setReplaceFile(event.target.files?.[0] || null)} />
                </label>
                {activeFile.kind === "PHOTO" ? (
                  <label className="btn-ghost h-8 cursor-pointer px-3 text-xs">
                    V2 cámara
                    <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => setReplaceFile(event.target.files?.[0] || null)} />
                  </label>
                ) : null}
                <button onClick={() => void onReplace()} disabled={!replaceFile || replacing} className="btn-primary h-8 px-3 text-xs disabled:opacity-60">
                  {replacing ? "Subiendo..." : replaceFile ? "Enviar versión" : "Selecciona archivo"}
                </button>
              </div>
              {activeFile.versions.length > 1 ? (
                <div className="mb-2 flex gap-2 overflow-x-auto">
                  {activeFile.versions.map((version) => (
                    <button
                      key={version.id}
                      onClick={() => setSelectedVersionId(version.id)}
                      className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold ${
                        selectedVersionId === version.id ? "border-primary bg-sky-50 text-primary" : "border-line bg-white text-muted"
                      }`}
                    >
                      V{version.versionNumber}
                    </button>
                  ))}
                </div>
              ) : null}

              <div
                ref={viewerRef}
                className={`relative min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-slate-100 ${drawMode ? "cursor-crosshair touch-none" : ""}`}
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
                onPointerLeave={onDrawUp}
              >
                {activeVersion?.kind === "PHOTO" ? (
                  <img src={`https://drive.google.com/thumbnail?id=${activeVersion.driveFileId}&sz=w2000`} alt={activeVersion.finalFilename} className="mx-auto max-h-[75vh] w-auto object-contain" />
                ) : (
                  <video controls className="mx-auto max-h-[75vh] w-full"><source src={activeVersion?.downloadUrl || activeFile.downloadUrl} type={activeVersion?.mimeType || activeFile.mimeType} /></video>
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
              {activeVersion ? (
                <p className="mb-2 text-xs text-muted">
                  Viendo versión V{activeVersion.versionNumber} · {new Date(activeVersion.createdAt).toLocaleString()}
                </p>
              ) : null}
              <form onSubmit={onCreateThread} className="mb-3 space-y-2 rounded-lg border border-line bg-slate-50 p-2">
                <textarea className="w-full rounded-lg border border-line bg-white p-2 text-sm outline-none focus:border-primary" rows={3} value={newThreadText} onChange={(event) => setNewThreadText(event.target.value)} placeholder="Nuevo comentario..." />
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
                    <div className="space-y-1">
                      {thread.messages.map((msg) => (
                        <div key={msg.id} className="rounded-lg bg-slate-100 px-2 py-1">
                          <p className="text-[11px] font-semibold text-muted">{roleLabel(msg.authorRole)} · {new Date(msg.createdAt).toLocaleString()} {msg.fileVersionNumber ? `· V${msg.fileVersionNumber}` : ""}</p>
                          <p className="whitespace-pre-wrap text-sm">{splitDrawAnnotation(msg.text).cleanText}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input className="input h-9" value={replyDraft[thread.id] || ""} onChange={(event) => setReplyDraft((prev) => ({ ...prev, [thread.id]: event.target.value }))} placeholder="Responder..." />
                      <button onClick={() => void onSendReply(thread.id)} className="btn-primary h-9 px-3 text-xs">Enviar</button>
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
