"use client";

import { useEffect, useState } from "react";
import { getDocuments } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import { setStoredUser, useStoredUser } from "@/lib/session";
import DocumentBuilder from "./DocumentBuilder";
import LoginForm from "./LoginForm";

// Loads the list of agreements from the backend, then shows the builder.
function DocumentLoader() {
  const [documents, setDocuments] = useState<DocumentSpec[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    getDocuments().then(setDocuments, () => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load the agreements. Check that the backend is running, then reload the page.
      </p>
    );
  }
  if (documents === null) return <p className="text-sm text-slate-600">Loading the agreements...</p>;
  return <DocumentBuilder documents={documents} />;
}

// Shows the sign-in screen, or the document builder once someone is signed in.
export default function App() {
  const user = useStoredUser();

  if (user === undefined) return null;
  if (user === null) return <LoginForm onLogin={setStoredUser} />;

  return (
    <>
      <header className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Pre-Legal</h1>
          <p className="text-sm text-slate-600">
            Tell the assistant what you need and the agreement fills in as you answer. Download it as a PDF when you are done.
          </p>
        </div>
        <p className="shrink-0 text-sm text-slate-600">
          Signed in as <span className="font-medium text-slate-800">{user.name}</span>
          <button
            type="button"
            onClick={() => setStoredUser(null)}
            className="ml-3 rounded-md border border-slate-300 px-3 py-1 hover:border-teal hover:text-teal"
          >
            Sign out
          </button>
        </p>
      </header>
      <DocumentLoader />
    </>
  );
}
