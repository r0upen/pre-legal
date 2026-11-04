"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chooseDocument, getStandardTerms, sendChat, type ChatMessage } from "@/lib/api";
import { documentKind, type DocValues, type DocumentSpec } from "@/lib/documents";
import Chat from "./Chat";
import DocumentChoices from "./DocumentChoices";
import Summary from "./Summary";

export const OPENING =
  "Hi there! I can help you draft a legal agreement from Common Paper's standard templates. What do you need? Pick one below, or describe it in your own words.";
const TITLE = "Pre-Legal";

export default function DocumentBuilder({ documents }: { documents: DocumentSpec[] }) {
  // Kept in memory only: a reload starts a new conversation.
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: OPENING }]);
  // Before a document is chosen the chat helps pick one; recommendation is the AI's pick.
  const [recommendation, setRecommendation] = useState<string | null>(null);
  // Once chosen: the document, where its interview starts in the chat, and its fields.
  const [doc, setDoc] = useState<DocumentSpec | null>(null);
  const [start, setStart] = useState(0);
  const [values, setValues] = useState<DocValues | null>(null);
  // Tagged with the document, so terms that arrive after switching documents are ignored;
  // text is null when they could not be loaded.
  const [terms, setTerms] = useState<{ id: string; text: string | null } | null>(null);
  // Set by Confirm details; any change from the chat clears it, so the summary shows again.
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // Bumped by Change document, so a reply to a message sent before it is ignored.
  const generation = useRef(0);

  const kind = doc && documentKind(doc);
  const loaded = doc && terms?.id === doc.id ? terms : null;
  const standardTerms = loaded?.text ?? null;
  const complete = !!kind && !!values && kind.isComplete(values);
  // Without the standard terms there is nothing to print, whatever the chat has collected.
  const ready = complete && confirmed && standardTerms !== null;
  const showSummary = complete && !confirmed;
  const hint = !doc
    ? "Available once you choose an agreement."
    : complete
      ? "Available once you confirm the details below."
      : "Available once all required details are collected.";
  const downloadRef = useRef<HTMLButtonElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  // Confirming removes the summary panel and its focused button, so keep keyboard focus on the next step.
  useEffect(() => {
    if (confirmed) downloadRef.current?.focus();
  }, [confirmed]);

  // The summary sits at the top of the scrolling document, so bring it into view when it appears.
  useEffect(() => {
    if (showSummary && documentRef.current) documentRef.current.scrollTop = 0;
  }, [showSummary]);

  // The page title is the default file name when saving the PDF.
  useEffect(() => {
    document.title = doc ? `${doc.name} - ${TITLE}` : TITLE;
  }, [doc]);

  function startDocument(spec: DocumentSpec) {
    const k = documentKind(spec);
    const chosen: ChatMessage[] = [...messages, { role: "user", content: spec.name }];
    // The interview starts at the greeting: the AI never sees how the document was chosen.
    setStart(chosen.length);
    setMessages([...chosen, { role: "assistant", content: k.greeting }]);
    setDoc(spec);
    setValues(k.empty);
    setRecommendation(null);
    setError("");
    getStandardTerms(spec.id).then(
      (text) => setTerms({ id: spec.id, text }),
      () => setTerms({ id: spec.id, text: null }),
    );
  }

  function changeDocument() {
    if (!window.confirm("Change document? Your answers so far will be cleared.")) return;
    generation.current += 1;
    setMessages([{ role: "assistant", content: OPENING }]);
    setDoc(null);
    setValues(null);
    setConfirmed(false);
    setError("");
  }

  // The user's message joins the history only once the assistant has answered,
  // so a failed send can be retried without duplicating it.
  async function handleSend(text: string): Promise<boolean> {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    const sentIn = generation.current;
    setPending(true);
    setError("");
    try {
      if (doc && values) {
        const turn = await sendChat(doc.id, next.slice(start), values);
        if (sentIn !== generation.current) return true;
        setMessages([...next, { role: "assistant", content: turn.reply }]);
        setValues(turn.fields);
        // Both come from the same JSON shape, so equal values serialize the same way.
        if (JSON.stringify(turn.fields) !== JSON.stringify(values)) setConfirmed(false);
      } else {
        const turn = await chooseDocument(next);
        if (sentIn !== generation.current) return true;
        setMessages([...next, { role: "assistant", content: turn.reply }]);
        setRecommendation(turn.recommendation);
      }
      return true;
    } catch {
      setError("The assistant could not respond. Your message is still in the box, so you can send it again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    // On wide screens the row (grid-rows-1 is minmax(0, 1fr)) and min-h-0 keep the panes to the
    // window height, so they scroll inside instead of growing with their content.
    <div className="grid flex-1 gap-6 lg:min-h-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-1 print:block">
      <aside className="flex flex-col gap-4 lg:min-h-0 print:hidden">
        <p role="note" className="rounded-md border-l-4 border-teal bg-teal/10 p-3 text-sm text-slate-700">
          This draft is a starting point for review by a lawyer. It is not legal advice.
        </p>
        <Chat
          messages={messages}
          pending={pending}
          error={error}
          onSend={handleSend}
          documentName={doc?.name}
          onChangeDocument={doc ? changeDocument : undefined}
        >
          {!doc && (
            <DocumentChoices
              documents={documents}
              recommended={documents.find((d) => d.id === recommendation)}
              onStart={startDocument}
            />
          )}
        </Chat>
      </aside>

      <section aria-label="Document preview" className="flex flex-col gap-4 lg:min-h-0">
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
        <div ref={documentRef} className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto print:overflow-visible">
          {showSummary && <Summary rows={kind.summarize(values)} onConfirm={() => setConfirmed(true)} />}
          {kind && values && standardTerms !== null ? (
            <article className="nda-doc rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{kind.build(values, standardTerms)}</ReactMarkdown>
            </article>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              {!doc
                ? "Your draft will appear here once you choose an agreement."
                : loaded
                  ? "Could not load this agreement's template. Change document and choose it again."
                  : "Loading the agreement..."}
            </p>
          )}
          <p className="hidden text-xs italic text-slate-600 print:block">
            Draft prepared with Pre-Legal. This draft is a starting point for review by a lawyer. It is not legal advice.
          </p>
        </div>
      </section>
    </div>
  );
}
