"use client";

import { FormEvent, useEffect, useState } from "react";
import { parseResponseJson } from "@/lib/client-json";

type SmtpPayload = {
  item: {
    smtpEnabled: boolean;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
    smtpUser: string | null;
    smtpFrom: string | null;
    smtpReplyTo: string | null;
    hasPassword: boolean;
  };
};

export function AdminSmtpSettings() {
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpReplyTo, setSmtpReplyTo] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings/smtp", { cache: "no-store" });
      const json = await parseResponseJson<SmtpPayload & { error?: string }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo cargar SMTP");
        return;
      }

      setSmtpEnabled(Boolean(json?.item.smtpEnabled));
      setSmtpHost(json?.item.smtpHost || "");
      setSmtpPort(String(json?.item.smtpPort || 587));
      setSmtpSecure(Boolean(json?.item.smtpSecure));
      setSmtpUser(json?.item.smtpUser || "");
      setSmtpFrom(json?.item.smtpFrom || "");
      setSmtpReplyTo(json?.item.smtpReplyTo || "");
      setHasPassword(Boolean(json?.item.hasPassword));
      setSmtpPass("");
      setClearPassword(false);
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
      const response = await fetch("/api/admin/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpEnabled,
          smtpHost: smtpHost.trim() || null,
          smtpPort: Number(smtpPort) || null,
          smtpSecure,
          smtpUser: smtpUser.trim() || null,
          ...(smtpPass.trim() ? { smtpPass: smtpPass.trim() } : {}),
          clearPassword,
          smtpFrom: smtpFrom.trim() || null,
          smtpReplyTo: smtpReplyTo.trim() || null
        })
      });
      const json = await parseResponseJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo guardar SMTP");
        return;
      }
      setMessage("Configuración SMTP guardada");
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
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Configuración SMTP</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={smtpEnabled} onChange={(e) => setSmtpEnabled(e.target.checked)} />
          Activar envío SMTP
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Servidor SMTP</span>
          <input className="input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.dominio.com" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted">Puerto</span>
            <input className="input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} />
            TLS/SSL (`secure`)
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Usuario SMTP</span>
          <input className="input" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="usuario@dominio.com" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">
            Contraseña SMTP {hasPassword ? "(ya guardada, escribe solo si quieres reemplazar)" : ""}
          </span>
          <input className="input" type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} placeholder="••••••••" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={clearPassword} onChange={(e) => setClearPassword(e.target.checked)} />
          Borrar contraseña guardada
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">From</span>
          <input className="input" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="FotoFacil <noreply@dominio.com>" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Reply-To (opcional)</span>
          <input className="input" value={smtpReplyTo} onChange={(e) => setSmtpReplyTo(e.target.value)} placeholder="soporte@dominio.com" />
        </label>
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-success">{message}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <button disabled={saving || loading} className="btn-primary h-11 w-full disabled:opacity-60">
          {saving ? "Guardando..." : "Guardar SMTP"}
        </button>
      </form>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Guía rápida</p>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>1. Activa SMTP.</li>
          <li>2. Define `host`, `port` y si usa `secure` (465 suele ir con secure; 587 suele ir sin secure).</li>
          <li>3. Añade credenciales (`user` y `password`) si tu proveedor las requiere.</li>
          <li>4. Configura `From` para el remitente visible.</li>
          <li>5. Guarda y las notificaciones usarán SMTP antes de fallback a Resend.</li>
        </ul>
      </article>
    </section>
  );
}
