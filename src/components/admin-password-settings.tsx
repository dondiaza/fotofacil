"use client";

import { FormEvent, useState } from "react";

export function AdminPasswordSettings() {
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (newPassword !== repeatPassword) {
      setError("La confirmación de contraseña no coincide");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword
        })
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setError((json as { error?: string } | null)?.error || "No se pudo actualizar la contraseña");
        return;
      }

      setNewPassword("");
      setRepeatPassword("");
      setMessage("Contraseña actualizada");
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-4 lg:grid-cols-[460px_1fr]">
      <form onSubmit={onSubmit} className="panel space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Cambiar contraseña</p>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Nueva contraseña</span>
          <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-muted">Confirmar nueva contraseña</span>
          <input className="input" type="password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} />
        </label>
        {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-success">{message}</p> : null}
        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}
        <button disabled={saving} className="btn-primary h-11 w-full disabled:opacity-60">
          {saving ? "Guardando..." : "Actualizar contraseña"}
        </button>
      </form>

      <article className="panel p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Recomendación</p>
        <ul className="mt-2 space-y-2 text-sm text-muted">
          <li>1. Usa una contraseña única para FotoFácil.</li>
          <li>2. Evita claves ya usadas en otros servicios.</li>
          <li>3. Guarda la nueva clave en un gestor de contraseñas.</li>
        </ul>
      </article>
    </section>
  );
}
