import type { SummaryRow } from "@/lib/documents";

const badge = "rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600";

// Shown once the changes question is answered: the user checks the values and confirms them
// before Download PDF is enabled. Built from the fields, not written by the AI. Disabled while
// a reply is on its way, since that reply could change the details.
type Props = { rows: SummaryRow[]; onConfirm: () => void; disabled: boolean };

export default function Summary({ rows, onConfirm, disabled }: Props) {
  return (
    <section aria-label="Check the details" className="rounded-lg border border-teal bg-white p-4 shadow-sm print:hidden">
      <h3 className="font-semibold text-navy">Check the details</h3>
      <p className="text-sm text-slate-600">Confirm them to enable the download, or tell the assistant what to change.</p>
      {rows.some((r) => r.isDefault) && (
        <p className="mt-1 text-sm text-slate-600">
          <span className={badge}>Default</span> marks Common Paper&apos;s usual term, which you have not specifically
          chosen.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-1 text-sm">
        {rows.map(({ label, value, isDefault }) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-800">
              {value}
              {isDefault && <span className={`ml-2 ${badge}`}>Default</span>}
            </dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="mt-4 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-navy disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-teal"
      >
        Confirm details
      </button>
    </section>
  );
}
