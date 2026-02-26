"use client";

import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/chat-panel";

type StoreListItem = {
  id: string;
  name: string;
  storeCode: string;
  unreadMessages: number;
};

export function AdminInbox() {
  const [stores, setStores] = useState<StoreListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const response = await fetch("/api/admin/stores", { cache: "no-store" });
    const json = await response.json();
    const items: StoreListItem[] = (json.items || []).map((entry: any) => ({
      id: entry.id,
      name: entry.name,
      storeCode: entry.storeCode,
      unreadMessages: entry.unreadMessages || 0
    }));
    setStores(items);
    if (!selected && items.length > 0) {
      setSelected(items[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Bandeja</p>
          <button onClick={() => void load()} className="text-xs font-semibold text-primary hover:underline">
            Actualizar
          </button>
        </div>
        {loading ? <p className="text-sm text-muted">Cargando...</p> : null}
        <ul className="space-y-2">
          {stores.map((store) => (
            <li key={store.id}>
              <button
                onClick={() => setSelected(store.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left ${
                  selected === store.id ? "border-primary bg-cyan-50" : "border-line bg-white"
                }`}
              >
                <p className="text-sm font-semibold">
                  {store.storeCode} · {store.name}
                </p>
                <p className="text-xs text-muted">{store.unreadMessages} sin leer</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div>{selected ? <ChatPanel storeId={selected} currentRole="SUPERADMIN" title="Chat seleccionado" /> : null}</div>
    </section>
  );
}
