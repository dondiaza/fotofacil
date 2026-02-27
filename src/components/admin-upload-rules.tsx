"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ManagerRole = "SUPERADMIN" | "CLUSTER";
type Requirement = "NONE" | "PHOTO" | "VIDEO" | "BOTH";
type Scope = "global" | "store";

type RuleItem = {
  weekday: number;
  label: string;
  requirement: Requirement;
};

type RulesResponse = {
  item: {
    scope: "global" | "cluster" | "store";
    storeId: string | null;
    rules: RuleItem[];
  };
  stores: Array<{
    id: string;
    storeCode: string;
    name: string;
    clusterId: string | null;
  }>;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function requirementFromFlags(photo: boolean, video: boolean): Requirement {
  if (photo && video) return "BOTH";
  if (photo) return "PHOTO";
  if (video) return "VIDEO";
  return "NONE";
}

function flagsFromRequirement(requirement: Requirement) {
  return {
    photo: requirement === "PHOTO" || requirement === "BOTH",
    video: requirement === "VIDEO" || requirement === "BOTH"
  };
}

export function AdminUploadRules(props: { managerRole: ManagerRole; managerClusterId: string | null }) {
  const [scope, setScope] = useState<Scope>(props.managerRole === "SUPERADMIN" ? "global" : "store");
  const [storeId, setStoreId] = useState("");
  const [stores, setStores] = useState<RulesResponse["stores"]>([]);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        return DAY_ORDER.indexOf(a.weekday) - DAY_ORDER.indexOf(b.weekday);
      }),
    [rules]
  );

  const canEditGlobal = props.managerRole === "SUPERADMIN";

  const load = async (forced?: { scope?: Scope; storeId?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const targetScope = forced?.scope ?? scope;
      const targetStoreId = forced?.storeId ?? storeId;
      const params = new URLSearchParams();
      params.set("scope", targetScope);
      if (targetScope === "store" && targetStoreId) {
        params.set("storeId", targetStoreId);
      }
      const response = await fetch(`/api/admin/upload-rules?${params.toString()}`, { cache: "no-store" });
      const json = (await response.json()) as RulesResponse & { error?: string };
      if (!response.ok) {
        setError(json.error || "No se pudieron cargar reglas");
        return;
      }

      setStores(json.stores || []);
      setRules(json.item.rules || []);
      if (json.item.scope === "store") {
        setScope("store");
        setStoreId(json.item.storeId || (json.stores[0]?.id ?? ""));
      } else {
        setScope("global");
        if (!storeId && json.stores.length > 0) {
          setStoreId(json.stores[0].id);
        }
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ scope: scope, storeId: storeId || undefined });
  }, []);

  const setRuleByWeekday = (weekday: number, patch: Partial<{ photo: boolean; video: boolean }>) => {
    setRules((prev) =>
      prev.map((rule) => {
        if (rule.weekday !== weekday) return rule;
        const current = flagsFromRequirement(rule.requirement);
        const next = {
          photo: patch.photo ?? current.photo,
          video: patch.video ?? current.video
        };
        return {
          ...rule,
          requirement: requirementFromFlags(next.photo, next.video)
        };
      })
    );
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/upload-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          storeId: scope === "store" ? storeId : undefined,
          rules: rules.map((rule) => ({ weekday: rule.weekday, requirement: rule.requirement }))
        })
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error || "No se pudieron guardar reglas");
        return;
      }
      setMessage("Reglas guardadas");
      await load();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const headers = orderedRules.map((rule) => (
    <th key={rule.weekday} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-muted">
      {rule.label}
    </th>
  ));

  return (
    <article className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Gestor simple de días requeridos</p>
        <button onClick={() => void load()} className="text-xs font-semibold text-primary hover:underline">
          Actualizar
        </button>
      </div>

      <form onSubmit={onSave} className="space-y-3">
        <div className="grid gap-2 md:grid-cols-[180px_1fr]">
          <label className="space-y-1">
            <span className="text-xs text-muted">Alcance</span>
            <select
              className="input"
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as Scope;
                setScope(nextScope);
                if (nextScope === "global") {
                  void load({ scope: "global" });
                } else {
                  const fallbackStoreId = storeId || stores[0]?.id || "";
                  setStoreId(fallbackStoreId);
                  void load({ scope: "store", storeId: fallbackStoreId });
                }
              }}
            >
              {canEditGlobal ? <option value="global">Global (todas)</option> : null}
              <option value="store">Individual por tienda</option>
            </select>
          </label>

          {scope === "store" ? (
            <label className="space-y-1">
              <span className="text-xs text-muted">Tienda</span>
              <select
                className="input"
                value={storeId}
                onChange={(event) => {
                  const value = event.target.value;
                  setStoreId(value);
                  void load({ scope: "store", storeId: value });
                }}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.storeCode} · {store.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded-xl border border-line bg-slate-50 px-3 py-2 text-sm text-muted">
              El esquema global aplica a todas las tiendas sin configuración individual.
            </div>
          )}
        </div>

        {loading ? <p className="text-sm text-muted">Cargando reglas...</p> : null}

        {!loading ? (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted">Tipo</th>
                  {headers}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="rounded-l-xl border border-line bg-white px-2 py-2 font-semibold">Foto</td>
                  {orderedRules.map((rule) => {
                    const flags = flagsFromRequirement(rule.requirement);
                    return (
                      <td key={`photo-${rule.weekday}`} className="border border-line bg-white px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={flags.photo}
                          onChange={(event) => setRuleByWeekday(rule.weekday, { photo: event.target.checked })}
                        />
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="rounded-l-xl border border-line bg-white px-2 py-2 font-semibold">Vídeo</td>
                  {orderedRules.map((rule) => {
                    const flags = flagsFromRequirement(rule.requirement);
                    return (
                      <td key={`video-${rule.weekday}`} className="border border-line bg-white px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={flags.video}
                          onChange={(event) => setRuleByWeekday(rule.weekday, { video: event.target.checked })}
                        />
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {message ? <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-success">{message}</p> : null}
        {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

        <button disabled={saving || loading || (scope === "global" && !canEditGlobal)} className="btn-primary h-11 w-full disabled:opacity-60">
          {saving ? "Guardando..." : "Guardar reglas"}
        </button>
      </form>
    </article>
  );
}
