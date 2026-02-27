"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ManagerRole = "SUPERADMIN" | "CLUSTER";
type Requirement = "NONE" | "PHOTO" | "VIDEO" | "BOTH";
type Scope = "global" | "cluster" | "store";

type RuleItem = {
  weekday: number;
  label: string;
  requirement: Requirement;
};

type RulesResponse = {
  item: {
    scope: "global" | "cluster" | "store";
    storeId: string | null;
    clusterId: string | null;
    rules: RuleItem[];
  };
  stores: Array<{
    id: string;
    storeCode: string;
    name: string;
    clusterId: string | null;
  }>;
  clusters: Array<{
    id: string;
    code: string;
    name: string;
  }>;
};

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

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
  const [scope, setScope] = useState<Scope>(props.managerRole === "SUPERADMIN" ? "global" : "cluster");
  const [storeId, setStoreId] = useState("");
  const [clusterId, setClusterId] = useState(props.managerClusterId || "");
  const [stores, setStores] = useState<RulesResponse["stores"]>([]);
  const [clusters, setClusters] = useState<RulesResponse["clusters"]>([]);
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

  const load = async (forced?: { scope?: Scope; storeId?: string; clusterId?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const targetScope = forced?.scope ?? scope;
      const targetStoreId = forced?.storeId ?? storeId;
      const targetClusterId = forced?.clusterId ?? clusterId;
      const params = new URLSearchParams();
      params.set("scope", targetScope);
      if (targetScope === "store" && targetStoreId) {
        params.set("storeId", targetStoreId);
      }
      if (targetScope === "cluster" && targetClusterId) {
        params.set("clusterId", targetClusterId);
      }
      const response = await fetch(`/api/admin/upload-rules?${params.toString()}`, { cache: "no-store" });
      const json = (await parseJson(response)) as (RulesResponse & { error?: string }) | null;
      if (!response.ok) {
        setError(json?.error || "No se pudieron cargar reglas");
        return;
      }

      setStores(json?.stores || []);
      setClusters(json?.clusters || []);
      setRules(json?.item.rules || []);
      if (json?.item.scope === "store") {
        setScope("store");
        setStoreId(json.item.storeId || (json.stores?.[0]?.id ?? ""));
      } else if (json?.item.scope === "cluster") {
        setScope("cluster");
        setClusterId(
          json.item.clusterId ||
            props.managerClusterId ||
            json.clusters?.[0]?.id ||
            ""
        );
      } else {
        setScope("global");
        if (!storeId && (json?.stores?.length || 0) > 0) {
          setStoreId(json!.stores[0].id);
        }
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ scope, storeId: storeId || undefined, clusterId: clusterId || undefined });
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
          clusterId: scope === "cluster" ? clusterId : undefined,
          storeId: scope === "store" ? storeId : undefined,
          rules: rules.map((rule) => ({ weekday: rule.weekday, requirement: rule.requirement }))
        })
      });
      const json = (await parseJson(response)) as { error?: string } | null;
      if (!response.ok) {
        setError(json?.error || "No se pudieron guardar reglas");
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
                } else if (nextScope === "cluster") {
                  const fallbackClusterId = clusterId || props.managerClusterId || clusters[0]?.id || "";
                  setClusterId(fallbackClusterId);
                  void load({ scope: "cluster", clusterId: fallbackClusterId });
                } else {
                  const fallbackStoreId = storeId || stores[0]?.id || "";
                  setStoreId(fallbackStoreId);
                  void load({ scope: "store", storeId: fallbackStoreId });
                }
              }}
            >
              {canEditGlobal ? <option value="global">Global (todas)</option> : null}
              <option value="cluster">Global por cluster</option>
              <option value="store">Individual por tienda</option>
            </select>
          </label>

          {scope === "cluster" ? (
            <label className="space-y-1">
              <span className="text-xs text-muted">Cluster</span>
              <select
                className="input"
                value={clusterId}
                onChange={(event) => {
                  const value = event.target.value;
                  setClusterId(value);
                  void load({ scope: "cluster", clusterId: value });
                }}
                disabled={props.managerRole !== "SUPERADMIN"}
              >
                {(props.managerRole === "SUPERADMIN" ? clusters : clusters.filter((cluster) => cluster.id === props.managerClusterId)).map((cluster) => (
                  <option key={cluster.id} value={cluster.id}>
                    {cluster.code} · {cluster.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

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
              {scope === "global"
                ? "El esquema global aplica a todas las tiendas sin configuración individual."
                : "El esquema del cluster aplica a sus tiendas sin configuración individual."}
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

        <button
          disabled={saving || loading || (scope === "global" && !canEditGlobal)}
          className="btn-primary h-11 w-full disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar reglas"}
        </button>
      </form>
    </article>
  );
}
