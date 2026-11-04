import { useState } from "react";
import type { DocumentSpec } from "@/lib/documents";

const SUGGESTED = ["mutual-nda", "cloud-service-agreement", "professional-services-agreement"];
const chip = "rounded-full border border-teal bg-white px-3 py-1.5 text-sm text-teal hover:bg-teal hover:text-white";

type Props = {
  documents: DocumentSpec[];
  // The AI's pick from the user's description, shown as a Start button.
  recommended?: DocumentSpec;
  onStart: (spec: DocumentSpec) => void;
};

// The ways to choose a document, shown in the chat until one is started.
export default function DocumentChoices({ documents, recommended, onStart }: Props) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-3">
      {recommended && (
        <button
          type="button"
          onClick={() => onStart(recommended)}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-navy"
        >
          Start {recommended.name}
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {documents
          .filter((d) => SUGGESTED.includes(d.id))
          .map((d) => (
            <button key={d.id} type="button" onClick={() => onStart(d)} className={chip}>
              {d.name}
            </button>
          ))}
        <button type="button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)} className={chip}>
          {showAll ? "Hide the list" : "See all"}
        </button>
      </div>
      {showAll && (
        <ul aria-label="All agreements" className="space-y-2">
          {documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onStart(d)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-teal"
              >
                <span className="block text-sm font-medium text-navy">{d.name}</span>
                <span className="block text-xs text-slate-600">{d.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
