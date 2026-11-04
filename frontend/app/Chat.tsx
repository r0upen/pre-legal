"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/api";

type Props = {
  messages: ChatMessage[];
  pending: boolean;
  error: string;
  // Resolves to true once the assistant has answered; the typed text is kept otherwise.
  onSend: (text: string) => Promise<boolean>;
  // The agreement being drafted, shown in the header.
  documentName?: string;
  // Buttons shown under the latest message, such as document suggestions.
  children?: React.ReactNode;
};

const bubble = "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm";

export default function Chat({ messages, pending, error, onSend, documentName, children }: Props) {
  const [draft, setDraft] = useState("");
  const text = draft.trim();
  const logRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Start in the message box, except on touch screens, where focusing would pop up the keyboard.
  // Return to it once a document starts: the button clicked to start it disappears, and focus
  // would otherwise fall to the page.
  const firstRender = useRef(true);
  useEffect(() => {
    if (!firstRender.current || window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
    firstRender.current = false;
  }, [documentName]);

  // Keep the latest message, and any buttons under it, in view.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, pending, children]);

  // Grow the box with its text, up to its max height.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  }, [draft]);

  // The box is read-only rather than disabled while waiting: browsers move focus off a
  // disabled field, so the user would have to click it again after every answer.
  async function send() {
    inputRef.current?.focus();
    if (!text || pending) return;
    if (await onSend(text)) setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends and Shift+Enter starts a new line. Enter that confirms an IME composition does
    // neither; Safari reports that one only through keyCode 229.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send();
    }
  }

  return (
    <section
      aria-label="Chat"
      className="flex h-[70dvh] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:h-auto lg:min-h-0 lg:flex-1"
    >
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">
          AI
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy">Pre-Legal assistant</h2>
          {documentName && <p className="truncate text-xs text-slate-500">{documentName}</p>}
        </div>
      </header>
      <ol ref={logRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-5">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
            <p
              className={
                m.role === "user"
                  ? `${bubble} rounded-br-md bg-navy text-white`
                  : `${bubble} rounded-bl-md border border-slate-200 bg-white text-slate-800`
              }
            >
              {m.content}
            </p>
          </li>
        ))}
        {children && !pending && <li>{children}</li>}
        {pending && (
          <li className="flex">
            <p className={`${bubble} flex items-center gap-1 rounded-bl-md border border-slate-200 bg-white py-3.5`}>
              <span className="sr-only">Assistant is typing</span>
              {["", "[animation-delay:150ms]", "[animation-delay:300ms]"].map((delay) => (
                <span
                  key={delay}
                  aria-hidden
                  className={`size-2 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none ${delay}`}
                />
              ))}
            </p>
          </li>
        )}
      </ol>
      {error && (
        <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-slate-200 p-3"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white py-1.5 pl-4 pr-1.5 focus-within:border-teal focus-within:ring-1 focus-within:ring-teal">
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            placeholder="Type your answer..."
            className="max-h-40 flex-1 resize-none self-center bg-transparent py-1.5 text-sm placeholder:text-slate-400 focus:outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            readOnly={pending}
            maxLength={4000}
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={pending || !text}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-white hover:bg-teal disabled:opacity-40 disabled:hover:bg-navy"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M3.1 2.3a.75.75 0 0 0-.9 1l2.2 5.9h6.8a.75.75 0 0 1 0 1.5H4.4l-2.2 5.9a.75.75 0 0 0 .9 1l14.5-6.5a.75.75 0 0 0 0-1.4L3.1 2.3Z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 px-1 text-xs text-slate-400">Enter to send, Shift+Enter for a new line</p>
      </form>
    </section>
  );
}
