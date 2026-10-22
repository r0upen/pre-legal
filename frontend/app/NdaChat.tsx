"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/api";
import { inputClass } from "./LoginForm";

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  error: string;
  // Resolves to true once the assistant has answered; the typed text is kept otherwise.
  onSend: (text: string) => Promise<boolean>;
};

export default function NdaChat({ messages, pending, error, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const text = draft.trim();
  const logRef = useRef<HTMLOListElement>(null);

  // Keep the latest message in view.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, pending]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text || pending) return;
    if (await onSend(text)) setDraft("");
  }

  return (
    <section aria-label="Chat" className="flex flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <ol ref={logRef} role="log" aria-live="polite" className="max-h-[60vh] min-h-64 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
            <p
              className={
                m.role === "user"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-lg bg-navy px-3 py-2 text-sm text-white"
                  : "max-w-[85%] whitespace-pre-wrap rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800"
              }
            >
              {m.content}
            </p>
          </li>
        ))}
        {pending && <li className="text-sm italic text-slate-500">Thinking...</li>}
      </ol>
      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-4">
        <label className="flex-1 text-sm font-medium text-slate-700">
          Your message
          <input
            className={inputClass}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            maxLength={4000}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !text}
          className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-teal disabled:opacity-60 disabled:hover:bg-navy"
        >
          Send
        </button>
      </form>
    </section>
  );
}
