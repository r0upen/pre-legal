"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  chooseDocument,
  createDraft,
  getStandardTerms,
  sendChat,
  updateDraft,
  type ChatMessage,
  type Draft,
  type DraftState,
  type DraftSummary,
} from "@/lib/api";
import { documentKind, type DocValues, type DocumentSpec } from "@/lib/documents";
import Chat from "./Chat";
import DocumentChoices from "./DocumentChoices";
import Summary from "./Summary";

export const OPENING =
  "Hi there! I can help you draft a legal agreement from Common Paper's standard templates. What do you need? Pick one below, or describe it in your own words.";
const TITLE = "Pre-Legal";

type Props = {
  documents: DocumentSpec[];
  // The draft to reopen; without one the chat starts by choosing a document.
  saved: Draft | null;
  // Called once the new draft exists, so the sidebar can mark it as the open one.
  onCreated: (id: number) => void;
  // Called after every save, so the sidebar stays up to date.
  onSaved: (summary: DraftSummary) => void;
};

export default function DocumentBuilder({ documents, saved, onCreated, onSaved }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(saved?.messages ?? [{ role: "assistant", content: OPENING }]);
  // Before a document is chosen the chat helps pick one; recommendation is the AI's pick.
  const [recommendation, setRecommendation] = useState<string | null>(null);
  // Once chosen: the saved draft, its document, where its interview starts in the chat, and its fields.
  const [draftId, setDraftId] = useState(saved?.id ?? null);
  const [doc, setDoc] = useState(documents.find((d) => d.id === saved?.document) ?? null);
  const [start, setStart] = useState(saved?.start ?? 0);
  const [values, setValues] = useState<DocValues | null>(saved?.fields ?? null);
  // undefined while loading; null when they could not be loaded.
  const [standardTerms, setStandardTerms] = useState<string | null | undefined>(undefined);
  // Set by Confirm details; any change from the chat clears it, so the summary shows again.
  const [confirmed, setConfirmed] = useState(saved?.confirmed ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  // Bumped when the user moves to another document, so a reply that arrives after that is dropped:
  // saving it could overwrite a newer copy of the draft if they have since come back to it.
  const generation = useRef(0);

  const kind = doc && documentKind(doc);
  const complete = !!kind && !!values && kind.isComplete(values);
  // Without the standard terms there is nothing to print, whatever the chat has collected.
  const ready = complete && confirmed && typeof standardTerms === "string";
  const showSummary = complete && !confirmed;
  const hint = !doc
    ? "Available once you choose an agreement."
    : complete
      ? "Available once you confirm the details below."
      : "Available once all required details are collected.";
  const downloadRef = useRef<HTMLButtonElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const docId = doc?.id;

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (docId) getStandardTerms(docId).then(setStandardTerms, () => setStandardTerms(null));
  }, [docId]);

  // The summary sits at the top of the scrolling document, so bring it into view when it appears.
  useEffect(() => {
    if (showSummary && documentRef.current) documentRef.current.scrollTop = 0;
  }, [showSummary]);

  // The page title is the default file name when saving the PDF.
  useEffect(() => {
    document.title = doc ? `${doc.name} - ${TITLE}` : TITLE;
    return () => {
      document.title = TITLE;
    };
  }, [doc]);

  // A failed save is retried by the next one, which carries the full state anyway.
  function save(id: number, state: DraftState) {
    updateDraft(id, state).then(
      (summary) => {
        onSaved(summary);
        setSaveFailed(false);
      },
      () => setSaveFailed(true),
    );
  }

  // The draft is created before the interview opens, so every answer has a draft to be saved to.
  async function startDocument(spec: DocumentSpec) {
    const k = documentKind(spec);
    const chosen: ChatMessage[] = [...messages, { role: "user", content: spec.name }, { role: "assistant", content: k.greeting }];
    // The interview starts at the greeting: the AI never sees how the document was chosen.
    const interviewStart = chosen.length - 1;
    const sentIn = generation.current;
    setPending(true);
    setError("");
    try {
      const summary = await createDraft(spec.id, chosen, interviewStart, k.empty);
      onSaved(summary);
      if (sentIn !== generation.current) return;
      onCreated(summary.id);
      setDraftId(summary.id);
      setStart(interviewStart);
      setMessages(chosen);
      setDoc(spec);
      setValues(k.empty);
      setRecommendation(null);
    } catch {
      setError("Could not start this agreement. Try again.");
    } finally {
      setPending(false);
    }
  }

  function confirmDetails() {
    // Render first: the download button is disabled until then, and it cannot take focus.
    flushSync(() => setConfirmed(true));
    // Confirming removes the summary panel and its focused button, so keep keyboard focus on the next step.
    downloadRef.current?.focus();
    if (draftId !== null && values) save(draftId, { messages, start, fields: values, confirmed: true });
  }

  // The user's message joins the history only once the assistant has answered,
  // so a failed send can be retried without duplicating it.
  async function handleSend(text: string): Promise<boolean> {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    const sentIn = generation.current;
    setPending(true);
    setError("");
    try {
      if (doc && values && draftId !== null) {
        const turn = await sendChat(doc.id, next.slice(start), values);
        if (sentIn !== generation.current) return true;
        const answered: ChatMessage[] = [...next, { role: "assistant", content: turn.reply }];
        // Both come from the same JSON shape, so equal values serialize the same way.
        const stillConfirmed = confirmed && JSON.stringify(turn.fields) === JSON.stringify(values);
        setMessages(answered);
        setValues(turn.fields);
        setConfirmed(stillConfirmed);
        save(draftId, { messages: answered, start, fields: turn.fields, confirmed: stillConfirmed });
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
        {saveFailed && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Could not save your latest changes. They will be saved again with your next message.
          </p>
        )}
        <Chat
          messages={messages}
          pending={pending}
          error={error}
          onSend={handleSend}
          documentName={doc?.name}
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
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
          <h2 className="text-lg font-semibold text-navy">Preview</h2>
          <div className="flex items-center gap-3">
            {!ready && <p className="text-xs text-slate-500">{hint}</p>}
            <button
              ref={downloadRef}
              type="button"
              onClick={() => window.print()}
              disabled={!ready}
              className="shrink-0 whitespace-nowrap rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-teal disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-navy"
            >
              Download PDF
            </button>
          </div>
        </div>
        <div ref={documentRef} className="space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto print:overflow-visible">
          {showSummary && <Summary rows={kind.summarize(values)} onConfirm={confirmDetails} />}
          <p className="hidden text-xs italic text-slate-600 print:block">
            Draft prepared with Pre-Legal. This draft is a starting point for review by a lawyer. It is not legal advice.
          </p>
          {kind && values && typeof standardTerms === "string" ? (
            <article className="nda-doc rounded-lg border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:p-0 print:shadow-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{kind.build(values, standardTerms)}</ReactMarkdown>
            </article>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              {!doc
                ? "Your draft will appear here once you choose an agreement."
                : standardTerms === null
                  ? "Could not load this agreement's template. Reload the page and open it again from the sidebar."
                  : "Loading the agreement..."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
