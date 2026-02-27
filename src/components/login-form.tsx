"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { parseResponseJson } from "@/lib/client-json";

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password })
      });

      const json = await parseResponseJson<{ error?: string; user?: { role?: "STORE" | "CLUSTER" | "SUPERADMIN" } }>(response);
      if (!response.ok) {
        setError(json?.error || "Error de autenticación");
        return;
      }

      router.push(json?.user?.role === "STORE" ? "/store" : "/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="panel mx-auto w-full max-w-md space-y-4 p-6 sm:p-7">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">FotoFacil</p>
        <h1 className="mt-1 font-[var(--font-display)] text-2xl font-semibold">Acceso seguro</h1>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Usuario o email</span>
        <input
          required
          className="input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Contraseña</span>
        <input
          required
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <button type="submit" disabled={loading} className="btn-primary h-11 w-full disabled:opacity-60">
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
