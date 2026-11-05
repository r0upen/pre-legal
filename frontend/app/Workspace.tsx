"use client";

import { useEffect, useRef, useState } from "react";
import { deleteDraft, getDocuments, getDraft, listDrafts, logout, renameDraft, type Draft, type DraftSummary, type User } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import DocumentBuilder from "./DocumentBuilder";
import Sidebar from "./Sidebar";

// The logged-in app: the sidebar of saved drafts next to the builder for the open one.
export default function Workspace({ user, onLoggedOut }: { user: User; onLoggedOut: () => void }) {
  const [documents, setDocuments] = useState<DocumentSpec[] | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  // A new key gives the builder a fresh start, so nothing carries over between documents.
  const [view, setView] = useState<{ key: number; saved: Draft | null }>({ key: 0, saved: null });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [problem, setProblem] = useState("");
  // Bumped by each click, so only the document clicked last opens.
  const lastOpen = useRef(0);

  useEffect(() => {
    Promise.all([getDocuments(), listDrafts()]).then(
      ([docs, list]) => {
        setDocuments(docs);
        setDrafts(list);
      },
      () => setLoadFailed(true),
    );
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  function show(saved: Draft | null) {
    setView((v) => ({ key: v.key + 1, saved }));
    setActiveId(saved?.id ?? null);
    setMenuOpen(false);
    setProblem("");
  }

  function newDocument() {
    lastOpen.current += 1;
    show(null);
  }

  async function openDraft(id: number) {
    const click = ++lastOpen.current;
    if (id === activeId) {
      setMenuOpen(false);
      return;
    }
    try {
      const draft = await getDraft(id);
      if (click === lastOpen.current) show(draft);
    } catch {
      if (click === lastOpen.current) setProblem("Could not open that document. Try again.");
    }
  }

  // The latest change comes first, so a saved draft moves to the top of the list.
  function handleSaved(summary: DraftSummary) {
    setDrafts((current) => [summary, ...current.filter((d) => d.id !== summary.id)]);
  }

  // A rename is not a change to the agreement, so the draft keeps its place in the list.
  async function handleRename(id: number, title: string) {
    setProblem("");
    try {
      const summary = await renameDraft(id, title);
      setDrafts((current) => current.map((d) => (d.id === id ? summary : d)));
    } catch {
      setProblem("Could not rename that document. Try again.");
    }
  }

  async function handleDelete(id: number) {
    // Cancels a click still opening this draft, which would otherwise show it after it is gone.
    lastOpen.current += 1;
    // Leave the open draft first, so no new message can be sent to it and a late reply is dropped.
    if (id === activeId) show(null);
    setProblem("");
    try {
      await deleteDraft(id);
      setDrafts((current) => current.filter((d) => d.id !== id));
    } catch {
      setProblem("Could not delete that document. Try again.");
    }
  }

  async function handleLogout() {
    try {
      await logout();
      onLoggedOut();
    } catch {
      setProblem("Could not log you out. Try again.");
    }
  }

  return (
    <div className="flex flex-1 lg:min-h-0 print:block">
      <Sidebar
        user={user}
        documents={documents}
        drafts={drafts}
        activeId={activeId}
        open={menuOpen}
        problem={problem}
        onNew={newDocument}
        onOpen={openDraft}
        onRename={handleRename}
        onDelete={handleDelete}
        onLogout={handleLogout}
      />
      {menuOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-20 bg-slate-900/30 xl:hidden print:hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 print:block">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 xl:hidden print:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex size-9 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:border-teal hover:text-teal"
          >
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
              <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm.75 4.5a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75Z" />
            </svg>
          </button>
          <p className="text-lg font-semibold tracking-tight text-navy">Pre-Legal</p>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-4 lg:min-h-0 lg:p-6 print:block print:p-0">
          {loadFailed && (
            <p role="alert" className="text-sm text-red-700">
              Could not load your documents. Check that the backend is running, then reload the page.
            </p>
          )}
          {!loadFailed && !documents && <p className="text-sm text-slate-600">Loading your documents...</p>}
          {documents && (
            <DocumentBuilder
              key={view.key}
              documents={documents}
              saved={view.saved}
              onCreated={setActiveId}
              onSaved={handleSaved}
            />
          )}
        </div>
      </div>
    </div>
  );
}
