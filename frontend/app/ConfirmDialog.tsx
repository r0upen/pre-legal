import { useEffect, useId, useRef } from "react";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// A native modal: the browser keeps focus inside it, starts on Cancel (the first button) and closes on Escape.
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // The Escape that closes this dialog must not also close the sidebar drawer behind it.
      onKeyDown={(e) => {
        if (e.key === "Escape") e.stopPropagation();
      }}
      className="m-auto w-96 max-w-[calc(100vw-2rem)] rounded-lg bg-white p-5 shadow-xl backdrop:bg-slate-900/30"
    >
      <h2 id={titleId} className="text-base font-semibold text-navy">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:border-teal hover:text-teal"
        >
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-800">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
