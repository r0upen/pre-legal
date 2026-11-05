import type { DraftSummary, User } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import DraftItem from "./DraftItem";

type Props = {
  user: User;
  documents: DocumentSpec[] | null;
  drafts: DraftSummary[];
  activeId: number | null;
  // Narrow screens only: wide screens always show the sidebar.
  open: boolean;
  problem: string;
  onNew: () => void;
  onOpen: (id: number) => void;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => void;
  onLogout: () => void;
};

export default function Sidebar({ user, documents, drafts, activeId, open, problem, onNew, onOpen, onRename, onDelete, onLogout }: Props) {
  return (
    // invisible, not only moved away: the keyboard must not reach a closed drawer's buttons.
    <nav
      aria-label="Your documents"
      className={`fixed inset-y-0 left-0 z-30 flex w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform xl:static xl:visible xl:w-64 xl:translate-x-0 xl:transition-none print:hidden ${
        open ? "translate-x-0" : "invisible -translate-x-full"
      }`}
    >
      <div className="space-y-3 p-4">
        <p className="text-lg font-semibold tracking-tight text-navy">Pre-Legal</p>
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-md bg-navy px-3 py-2 text-sm font-medium text-white hover:bg-teal"
        >
          New document
        </button>
      </div>
      {problem && (
        <p role="alert" className="mx-4 mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {problem}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <h2 className="px-2 pb-1 text-xs font-medium text-slate-500">Your documents</h2>
        {drafts.length === 0 ? (
          <p className="px-2 py-1 text-sm text-slate-500">Documents you start will appear here.</p>
        ) : (
          <ul className="space-y-0.5">
            {drafts.map((draft) => (
              <DraftItem
                key={draft.id}
                draft={draft}
                documentName={documents?.find((d) => d.id === draft.document)?.name ?? draft.document}
                active={draft.id === activeId}
                onOpen={onOpen}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="shrink-0 rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-teal hover:text-teal"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
