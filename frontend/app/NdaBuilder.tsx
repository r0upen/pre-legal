"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { sendChat, type ChatMessage } from "@/lib/api";
import { buildNda, emptyValues, isComplete } from "@/lib/nda";
import NdaChat from "./NdaChat";
import NdaSummary from "./NdaSummary";

export const GREETING =
  "Hi there! I'm here to help you put together a Mutual NDA. I'll ask one thing at a time, and the draft fills in as we go. To start, what is the name of the first party?";

export default function NdaBuilder({ standardTerms }: { standardTerms: string }) {
  // Kept in memory only: a reload starts a new conversation.
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: GREETING }]);
  const [values, setValues] = useState(emptyValues);
  // Set by Confirm details; any change from the chat clears it, so the summary shows again.
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const markdown = buildNda(values, standardTerms);
  const complete = isComplete(values);
  const ready = complete && confirmed;
  const hint = complete ? "Available once you confirm the details below." : "Available once all required details are collected.";
  const downloadRef = useRef<HTMLButtonElement>(null);

  // Confirming removes the summary panel and its focused button, so keep keyboard focus on the next step.
  useEffect(() => {
    if (confirmed) downloadRef.current?.focus();
  }, [confirmed]);

  // The user's message joins the history only once the assistant has answered,
  // so a failed send can be retried without duplicating it.
  async function handleSend(text: string): Promise<boolean> {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setPending(true);
    setError("");
    try {
      const turn = await sendChat(next, values);
      setMessages([...next, { role: "assistant", content: turn.reply }]);
      setValues(turn.fields);
      // Both come from the same JSON shape, so equal values serialize the same way.
      if (JSON.stringify(turn.fields) !== JSON.stringify(values)) setConfirmed(false);
      return true;
    } catch {
      setError("The assistant could not respond. Your message is still in the box, so you can send it again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:block">
      <aside className="space-y-6 print:hidden">
        <p role="note" className="rounded-md border-l-4 border-teal bg-teal/10 p-3 text-sm text-slate-700">
          This draft is a starting point for review by a lawyer. It is not legal advice.
        </p>
        <NdaChat messages={messages} pending={pending} error={error} onSend={handleSend} />
      </aside>

      <section aria-label="NDA preview" className="space-y-4">
        <div className="flex items-center justify-between gap-4 print:hidden">
          <h2 className="text-lg font-semibold text-navy">Preview</h2>
          <div className="flex items-center gap-3">
            {!ready && <p className="text-xs text-slate-500">{hint}</p>}
            <button
              ref={downloadRef}
              type="button"
              onClick={() => window.print()}
              disabled={!ready}
              className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-navy"
            >
              Download PDF
            </button>
          </div>
        </div>
        {complete && !confirmed && <NdaSummary values={values} onConfirm={() => setConfirmed(true)} />}
        <article className="nda-doc rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </article>
        <p className="hidden text-xs italic text-slate-600 print:block">
          Draft prepared with Pre-Legal. This draft is a starting point for review by a lawyer. It is not legal advice.
        </p>
      </section>
    </div>
  );
}
