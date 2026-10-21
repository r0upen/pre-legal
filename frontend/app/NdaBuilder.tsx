"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { buildNda, defaultValues } from "@/lib/nda";
import NdaForm from "./NdaForm";

export default function NdaBuilder({ standardTerms }: { standardTerms: string }) {
  const [values, setValues] = useState(defaultValues);
  const markdown = buildNda(values, standardTerms);

  return (
    <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:block">
      <aside className="space-y-6 print:hidden">
        <p role="note" className="rounded-md border-l-4 border-teal bg-teal/10 p-3 text-sm text-slate-700">
          This draft is a starting point for review by a lawyer. It is not legal advice.
        </p>
        <NdaForm values={values} onChange={setValues} />
      </aside>

      <section aria-label="NDA preview" className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-lg font-semibold text-navy">Preview</h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-teal"
          >
            Download PDF
          </button>
        </div>
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
