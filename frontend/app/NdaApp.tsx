"use client";

import { useEffect, useState } from "react";
import { getMutualNdaTerms } from "@/lib/api";
import { setStoredUser, useStoredUser } from "@/lib/session";
import LoginForm from "./LoginForm";
import NdaBuilder from "./NdaBuilder";

// Loads the standard terms from the backend, then shows the builder.
function NdaLoader() {
  const [terms, setTerms] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    getMutualNdaTerms().then(setTerms, () => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load the NDA template. Check that the backend is running, then reload the page.
      </p>
    );
  }
  if (terms === null) return <p className="text-sm text-slate-600">Loading the NDA template...</p>;
  return <NdaBuilder standardTerms={terms} />;
}

// Shows the sign-in screen, or the NDA builder once someone is signed in.
export default function NdaApp() {
  const user = useStoredUser();

  if (user === undefined) return null;
  if (user === null) return <LoginForm onLogin={setStoredUser} />;

  return (
    <>
      <header className="flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-navy">Mutual NDA Creator</h1>
          <p className="text-sm text-slate-600">
            Chat with the assistant and the agreement fills in as you answer. Download it as a PDF when you are done.
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
      <NdaLoader />
    </>
  );
}
