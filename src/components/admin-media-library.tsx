"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { StatusChip } from "@/components/status-chip";
import { driveFilePreviewLink, driveFolderLink } from "@/lib/drive-links";

type StoreLite = {
  id: string;
  name: string;
  storeCode: string;
};

type MediaFile = {
  id: string;
  slotName: string;
  sequence: number;
  finalFilename: string;
  mimeType: string;
  driveFileId: string;
  driveWebViewLink: string | null;
  bytes: number;
  createdAt: string;
  thumbUrl: string;
  downloadUrl: string;
};

type UploadDayPayload = {
  id: string;
  status: "PENDING" | "PARTIAL" | "COMPLETE";
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

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export function AdminMediaLibrary() {
  const [date, setDate] = useState(todayDateInput());
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [payload, setPayload] = useState<MediaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const load = async (forcedStoreId?: string, forcedDate?: string) => {
    const dateToUse = forcedDate ?? date;
    const storeToUse = forcedStoreId ?? selectedStoreId;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("date", dateToUse);
      if (storeToUse) {
        params.set("storeId", storeToUse);
      }

      const response = await fetch(`/api/admin/media?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as MediaResponse & { error?: string };
      if (!response.ok) {
        setError(json.error || "No se pudo cargar biblioteca");
        return;
      }
      setPayload(json);
      if (json.selectedStoreId) {
        setSelectedStoreId(json.selectedStoreId);
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load("", date);
  }, []);

  const files = payload?.uploadDay?.files ?? [];
  const activeFile = galleryIndex !== null ? files[galleryIndex] : null;

  const selectedStore = useMemo(
    () => payload?.stores.find((store) => store.id === selectedStoreId) ?? null,
    [payload?.stores, selectedStoreId]
  );

  const onSubmitFilter = async (event: FormEvent) => {
    event.preventDefault();
    await load(selectedStoreId, date);
  };

  const openGallery = (index: number) => setGalleryIndex(index);
  const closeGallery = () => setGalleryIndex(null);
  const nextGallery = () => setGalleryIndex((value) => (value === null ? null : Math.min(value + 1, files.length - 1)));
  const prevGallery = () => setGalleryIndex((value) => (value === null ? null : Math.max(value - 1, 0)));

  return (
    <section className="space-y-4">
      <article className="panel p-4">
        <form onSubmit={onSubmitFilter} className="grid gap-2 sm:grid-cols-[1fr_180px_140px]">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Tienda</span>
            <select className="input" value={selectedStoreId} onChange={(event) => setSelectedStoreId(event.target.value)}>
              {(payload?.stores || []).map((store) => (
                <option key={store.id} value={store.id}>
                  {store.storeCode} · {store.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Fecha</span>
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <button className="btn-primary mt-6 h-11">Aplicar</button>
        </form>
      </article>

      {loading ? <p className="text-sm text-muted">Cargando biblioteca...</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      {payload?.uploadDay ? (
        <article className="panel p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {selectedStore?.storeCode} · {selectedStore?.name}
              </p>
              <p className="text-xs text-muted">Fecha {payload.date}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusChip status={payload.uploadDay.status} />
              <a
                className="btn-ghost h-9 px-3 text-xs"
                href={`/api/admin/media/pack?storeId=${selectedStoreId}&date=${payload.date}`}
              >
                Descargar pack
              </a>
              {payload.uploadDay.driveFolderId ? (
                <a
                  className="btn-ghost h-9 px-3 text-xs"
                  target="_blank"
                  rel="noreferrer"
                  href={driveFolderLink(payload.uploadDay.driveFolderId)}
                >
                  Abrir carpeta Drive
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {files.map((file, index) => (
              <article key={file.id} className="rounded-xl border border-line p-3">
                <div className="aspect-[4/3] overflow-hidden rounded-lg border border-line bg-slate-50">
                  {file.mimeType.startsWith("image/") ? (
                    <img src={file.thumbUrl} alt={file.finalFilename} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted">Preview no disponible</div>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-semibold">{file.finalFilename}</p>
                <p className="text-xs text-muted">
                  {file.slotName} · {Math.round(file.bytes / 1024)} KB
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button onClick={() => openGallery(index)} className="btn-primary h-9 px-3 text-xs">
                    Ver galería
                  </button>
                  <a href={file.downloadUrl} className="btn-ghost h-9 px-3 text-xs">
                    Descargar
                  </a>
                </div>
              </article>
            ))}
          </div>
        </article>
      ) : !loading ? (
        <article className="panel p-4 text-sm text-muted">No hay archivos para la selección actual.</article>
      ) : null}

      {activeFile ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{activeFile.finalFilename}</p>
              <button onClick={closeGallery} className="btn-ghost h-9 px-3 text-xs">
                Cerrar
              </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
              <div className="overflow-hidden rounded-xl border border-line bg-slate-50">
                {activeFile.mimeType.startsWith("image/") ? (
                  <img src={activeFile.thumbUrl} alt={activeFile.finalFilename} className="mx-auto max-h-[70vh] w-auto object-contain" />
                ) : (
                  <div className="flex h-[60vh] items-center justify-center p-4 text-sm text-muted">
                    Este archivo no tiene preview embebida.
                  </div>
                )}
              </div>

              <aside className="space-y-2">
                <a className="btn-primary h-10 w-full text-xs" href={activeFile.downloadUrl}>
                  Descargar archivo
                </a>
                <a
                  className="btn-ghost h-10 w-full text-xs"
                  href={driveFilePreviewLink(activeFile.driveFileId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir en Drive
                </a>
                <button onClick={prevGallery} disabled={galleryIndex === 0} className="btn-ghost h-10 w-full text-xs disabled:opacity-50">
                  Anterior
                </button>
                <button
                  onClick={nextGallery}
                  disabled={galleryIndex === files.length - 1}
                  className="btn-ghost h-10 w-full text-xs disabled:opacity-50"
                >
                  Siguiente
                </button>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
