"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { parseResponseJson } from "@/lib/client-json";

type Role = "STORE" | "CLUSTER" | "SUPERADMIN";

type MessageItem = {
  id: string;
  fromRole: Role;
  text: string;
  attachmentWebViewLink: string | null;
  attachmentPreviewUrl?: string | null;
  createdAt: string;
};

type ChatPanelProps = {
  storeId: string;
  currentRole: Role;
  title?: string;
  receiverLabel?: string;
};

export function ChatPanel({ storeId, currentRole, title, receiverLabel }: ChatPanelProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const loadMessages = async (cursorArg?: string | null) => {
    const query = cursorArg ? `?cursor=${cursorArg}` : "";
    const response = await fetch(`/api/messages/${storeId}${query}`, { cache: "no-store" });
    const json = await parseResponseJson<{ items?: MessageItem[]; nextCursor?: string | null; error?: string }>(response);
    if (!response.ok) {
      throw new Error(json?.error || "No se pudieron cargar los mensajes");
    }
    return {
      items: json?.items || [],
      nextCursor: json?.nextCursor ?? null
    };
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadMessages();
      setMessages(data.items);
      setCursor(data.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, 8000);
    return () => clearInterval(interval);
  }, [storeId]);

  const onLoadMore = async () => {
    if (!cursor) {
      return;
    }
    try {
      const data = await loadMessages(cursor);
      setMessages((prev) => [...data.items, ...prev]);
      setCursor(data.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !attachment) {
      return;
    }

    setSending(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("text", text.trim());
      if (attachment) {
        formData.append("attachment", attachment);
      }

      const response = await fetch(`/api/messages/${storeId}`, {
        method: "POST",
        body: formData
      });
      const json = await parseResponseJson<{ error?: string }>(response);
      if (!response.ok) {
        setError(json?.error || "No se pudo enviar el mensaje");
        return;
      }

      setText("");
      setAttachment(null);
      await refresh();
    } catch {
      setError("Error de conexión al enviar");
    } finally {
      setSending(false);
    }
  };

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [messages]
  );

  return (
    <section className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">{title || "Mensajes"}</p>
          {receiverLabel ? <p className="text-[11px] text-muted">Receptor: {receiverLabel}</p> : null}
        </div>
        <button onClick={() => void refresh()} className="text-xs font-semibold text-primary hover:underline">
          Actualizar
        </button>
      </div>

      {loading ? <p className="text-sm text-muted">Cargando chat...</p> : null}
      {error ? <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p> : null}

      <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border border-line bg-white p-2">
        {cursor ? (
          <button onClick={onLoadMore} className="mx-auto block text-xs font-semibold text-primary hover:underline">
            Cargar anteriores
          </button>
        ) : null}

        {orderedMessages.length === 0 ? <p className="p-2 text-sm text-muted">Sin mensajes todavía.</p> : null}

        {orderedMessages.map((msg) => {
          const mine = msg.fromRole === currentRole;
          return (
            <article
              key={msg.id}
              className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${mine ? "ml-auto bg-primary text-white" : "bg-slate-100 text-text"}`}
            >
              <p className="mb-1 text-[11px] font-semibold opacity-80">
                {msg.fromRole === "STORE" ? "Tienda" : msg.fromRole === "CLUSTER" ? "Cluster" : "Admin"}
              </p>
              <p className="mb-1 text-[11px] opacity-75">{new Date(msg.createdAt).toLocaleString()}</p>
              {msg.text ? <p className="whitespace-pre-wrap">{msg.text}</p> : null}
              {msg.attachmentPreviewUrl ? (
                <button
                  type="button"
                  onClick={() => setViewerUrl(msg.attachmentPreviewUrl || null)}
                  className="mt-1 block"
                >
                  <img
                    src={msg.attachmentPreviewUrl}
                    alt="Adjunto"
                    className="h-20 w-20 rounded-lg border border-white/30 object-cover"
                  />
                </button>
              ) : msg.attachmentWebViewLink ? (
                <a
                  className={`mt-1 inline-block text-xs font-semibold ${mine ? "text-white underline" : "text-primary hover:underline"}`}
                  href={msg.attachmentWebViewLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver adjunto
                </a>
              ) : null}
            </article>
          );
        })}
      </div>

      <form onSubmit={onSend} className="mt-3 space-y-2">
        <textarea
          className="w-full rounded-xl border border-line bg-white p-3 text-sm outline-none focus:border-primary"
          rows={3}
          placeholder="Escribe una incidencia..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
            Foto archivo
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
            />
          </label>
          <label className="btn-ghost h-10 cursor-pointer px-3 text-xs">
            Foto cámara
            <input
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => setAttachment(event.target.files?.[0] || null)}
            />
          </label>
          {attachment ? <span className="truncate text-xs text-muted">{attachment.name}</span> : null}
        </div>
        <button type="submit" disabled={sending} className="btn-primary h-11 w-full disabled:opacity-60">
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </form>

      {viewerUrl ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4">
          <article className="w-full max-w-4xl rounded-xl bg-white p-3">
            <div className="mb-2 flex justify-end">
              <button className="btn-ghost h-8 px-3 text-xs" onClick={() => setViewerUrl(null)}>
                Cerrar
              </button>
            </div>
            <img src={viewerUrl} alt="Adjunto completo" className="max-h-[78vh] w-full rounded-lg object-contain" />
          </article>
        </div>
      ) : null}
    </section>
  );
}
