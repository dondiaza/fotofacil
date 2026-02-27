"use client";

import { useState } from "react";

type ReminderItem = {
  id: string;
  fromRole: "CLUSTER" | "SUPERADMIN";
  text: string;
  createdAt: string;
};

export function StoreLoginReminderPopup({ items }: { items: ReminderItem[] }) {
  const [open, setOpen] = useState(items.length > 0);

  if (!open || items.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4">
      <article className="w-full max-w-xl rounded-xl bg-white p-4">
        <p className="text-sm font-semibold">Recordatorios pendientes</p>
        <p className="text-xs text-muted">Tienes avisos enviados por cluster/superadmin.</p>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-line px-3 py-2">
              <p className="text-[11px] font-semibold text-muted">
                {item.fromRole === "CLUSTER" ? "Cluster" : "Superadmin"} · {new Date(item.createdAt).toLocaleString()}
              </p>
              <p className="whitespace-pre-wrap text-sm">{item.text}</p>
            </li>
          ))}
        </ul>
        <button onClick={() => setOpen(false)} className="btn-primary mt-3 h-10 w-full">
          Entendido
        </button>
      </article>
    </div>
  );
}
