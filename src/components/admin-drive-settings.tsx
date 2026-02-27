"use client";

import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "@/lib/client-json";
import { driveFolderLink } from "@/lib/drive-links";

type SettingsPayload = {
  item: {
    driveRootFolderId: string | null;
    effectiveDriveRootFolderId: string | null;
    authMode: "oauth" | "service_account" | "none";
    rootMeta: {
      id?: string | null;
      name?: string | null;
      webViewLink?: string | null;
    } | null;
  };
};

export function AdminDriveSettings() {
  const [folderId, setFolderId] = useState("");
  const [effectiveFolderId, setEffectiveFolderId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<SettingsPayload["item"]["authMode"]>("none");
  const [folderMeta, setFolderMeta] = useState<SettingsPayload["item"]["rootMeta"]>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings/drive", { cache: "no-store" });
      const json = await parseResponseJson<SettingsPayload & { error?: string }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo cargar configuración");
        return;
      }
      setFolderId(json?.item.driveRootFolderId || "");
      setEffectiveFolderId(json?.item.effectiveDriveRootFolderId || null);
      setAuthMode(json?.item.authMode || "none");
      setFolderMeta(json?.item.rootMeta || null);
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings/drive", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driveRootFolderId: folderId.trim()
        })
      });
      const json = await parseResponseJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo guardar");
        return;
      }
      setMessage("Configuración de Drive guardada");
      await load();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[460px_1fr]">
      <form onSubmit={onSave} className="panel space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Vincular estructura Drive</p>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-muted">
          Modo autenticación:{" "}
          <strong className="text-slate-700">
            {authMode === "oauth" ? "OAuth backend" : authMode === "service_account" ? "Service Account" : "Sin configurar"}
          </strong>
        </p>
        <label className="block space-y-1">
          <span className="text-xs text-muted">ID carpeta raíz</span>
          <input
            className="input"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            placeholder="Ej: 1AbCdEfGhI..."
            required
          />
        </label>
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-success">{message}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <button disabled={saving || loading} className="btn-primary h-11 w-full disabled:opacity-60">
          {saving ? "Guardando..." : "Guardar y validar carpeta"}
        </button>
      </form>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Estructura prevista diaria</p>
        <div className="mt-2 rounded-xl border border-line bg-white p-3 text-sm">
          <p className="font-semibold">{folderMeta?.name || "RAIZ_PROYECTO_DRIVE"}</p>
          <p className="pl-4 text-muted">└─ Cluster Norte</p>
          <p className="pl-8 text-muted">└─ 043 Gran Via</p>
          <p className="pl-12 text-muted">└─ 2026</p>
          <p className="pl-16 text-muted">└─ 02 FEBRERO</p>
          <p className="pl-20 text-muted">└─ SEMANA 09</p>
          <p className="pl-24 text-muted">└─ JUEVES 26</p>
          <p className="pl-28 text-muted">├─ Foto</p>
          <p className="pl-32 text-muted">└─ 043_2026-02-26_ESCAPARATE_1_01.jpg</p>
          <p className="pl-28 text-muted">└─ Video (bajo demanda)</p>
        </div>

        <div className="mt-3 text-sm">
          <p className="text-muted">Carpeta raíz activa:</p>
          <p className="font-mono text-xs">{effectiveFolderId || "-"}</p>
          {effectiveFolderId ? (
            <a
              href={folderMeta?.webViewLink || driveFolderLink(effectiveFolderId)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Abrir raíz en Google Drive
            </a>
          ) : null}
        </div>
      </article>
    </section>
  );
}
