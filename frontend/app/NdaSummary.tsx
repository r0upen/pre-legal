import { summarize, type NdaValues } from "@/lib/nda";

// Shown once every detail is collected: the user checks the values and confirms them
// before Download PDF is enabled. Built from the fields, not written by the AI.
export default function NdaSummary({ values, onConfirm }: { values: NdaValues; onConfirm: () => void }) {
  return (
    <section aria-label="Check the details" className="rounded-lg border border-teal bg-white p-4 shadow-sm print:hidden">
      <h3 className="font-semibold text-navy">Check the details</h3>
      <p className="text-sm text-slate-600">Confirm them to enable the download, or tell the assistant what to change.</p>
      <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-4 gap-y-1 text-sm">
        {summarize(values).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        onClick={onConfirm}
        className="mt-4 rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-navy"
      >
        Confirm details
      </button>
    </section>
  );
}
