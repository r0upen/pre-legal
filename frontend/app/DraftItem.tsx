import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DraftSummary } from "@/lib/api";
import ConfirmDialog from "./ConfirmDialog";

type Props = {
  draft: DraftSummary;
  // The agreement's name, shown until the user renames the draft.
  documentName: string;
  active: boolean;
  onOpen: (id: number) => void;
  onRename: (id: number, title: string) => Promise<void>;
  onDelete: (id: number) => void;
};

// The parties known so far and the day of the last change, such as "Acme Inc. and Globex LLC, Nov 4".
function details(draft: DraftSummary): string {
  const day = new Date(draft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return draft.parties.length ? `${draft.parties.join(" and ")}, ${day}` : day;
}

// One sidebar item: opens the draft, and its menu renames or deletes it.
export default function DraftItem({ draft, documentName, active, onOpen, onRename, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuArea = useRef<HTMLDivElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  // Enter removes the input, which can also fire blur: only the first of them may rename.
  const renameFinished = useRef(false);
  const name = draft.title ?? documentName;

  useEffect(() => {
    if (!menuOpen) return;
    // The list scrolls, so the panel of an item at the bottom could start out of view.
    menuPanel.current?.scrollIntoView({ block: "nearest" });
    const closeIfOutside = (e: Event) => {
      if (!menuArea.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeIfOutside);
    window.addEventListener("focusin", closeIfOutside);
    return () => {
      window.removeEventListener("pointerdown", closeIfOutside);
      window.removeEventListener("focusin", closeIfOutside);
    };
  }, [menuOpen]);

  // Render first, since the menu button may only exist afterwards, then put keyboard focus back on it.
  function closeAndRefocus(close: () => void) {
    flushSync(close);
    menuButton.current?.focus();
  }

  function startRename() {
    renameFinished.current = false;
    setMenuOpen(false);
    setRenaming(true);
  }

  // The input stays until the save is done, so the old name never flashes back.
  async function finishRename(value: string, close: () => void) {
    if (renameFinished.current) return;
    renameFinished.current = true;
    const title = value.trim();
    if (title && title !== name) await onRename(draft.id, title);
    close();
  }

  function cancelRename() {
    renameFinished.current = true;
    closeAndRefocus(() => setRenaming(false));
  }

  if (renaming) {
    return (
      <li className="px-1 py-1">
        <input
          autoFocus
          aria-label={`New name for ${name}`}
          defaultValue={name}
          maxLength={100}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => finishRename(e.target.value, () => setRenaming(false))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Focus may reach the menu button before this key press ends, which would click it.
              e.preventDefault();
              finishRename(e.currentTarget.value, () => closeAndRefocus(() => setRenaming(false)));
            } else if (e.key === "Escape") {
              e.stopPropagation();
              cancelRename();
            }
          }}
          className="w-full rounded-md border border-teal px-2 py-2 text-sm text-navy outline-none"
        />
      </li>
    );
  }

  return (
    <li className={`flex items-center rounded-md hover:bg-slate-100 ${active ? "bg-slate-100" : ""}`}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={() => onOpen(draft.id)}
        className="min-w-0 flex-1 rounded-md py-2 pl-2 text-left"
      >
        <span className="block truncate text-sm font-medium text-navy">{name}</span>
        <span className="block truncate text-xs text-slate-500">{details(draft)}</span>
      </button>
      <div
        ref={menuArea}
        className="relative shrink-0"
        onKeyDown={(e) => {
          if (e.key === "Escape" && menuOpen) {
            // Only the menu closes, not the sidebar drawer it sits in.
            e.stopPropagation();
            closeAndRefocus(() => setMenuOpen(false));
          }
        }}
      >
        <button
          ref={menuButton}
          type="button"
          aria-label={`Options for ${name}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="mx-1 flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-navy"
        >
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="size-4">
            <path d="M3 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm5.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM14 10a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
          </svg>
        </button>
        {menuOpen && (
          <div ref={menuPanel} className="absolute right-1 top-full z-10 w-28 rounded-md border border-slate-200 bg-white py-1 shadow-md">
            <button autoFocus type="button" onClick={startRename} className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100">
              Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setConfirming(true);
              }}
              className="block w-full px-3 py-1.5 text-left text-sm text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title="Delete this document?"
          message={`"${name}" and its conversation will be permanently deleted. This can't be undone.`}
          confirmLabel="Delete"
          onCancel={() => closeAndRefocus(() => setConfirming(false))}
          onConfirm={() => {
            setConfirming(false);
            onDelete(draft.id);
          }}
        />
      )}
    </li>
  );
}
