"use client";

import { useEffect, useState } from "react";
import { getMe, setOnUnauthorized, type User } from "@/lib/api";
import AuthForm from "./AuthForm";
import Workspace from "./Workspace";

// Shown on every screen. The printed PDF carries its own copy (DocumentBuilder).
function LegalNotice() {
  return (
    <p
      role="note"
      className="sticky bottom-0 z-10 border-t border-teal/30 bg-[#e9f5f4] px-4 py-2 text-center text-xs text-slate-700 print:hidden"
    >
      Drafts are a starting point for review by a lawyer. They are not legal advice.
    </p>
  );
}

// Asks the backend who is logged in, then shows the log in screen or the workspace.
export default function App() {
  // undefined until the backend has answered.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    setOnUnauthorized(() => setUser(null));
    getMe().then(setUser, () => setUser(null));
  }, []);

  return (
    <>
      {user === null && <AuthForm onAuthenticated={setUser} />}
      {user && <Workspace user={user} onLoggedOut={() => setUser(null)} />}
      {user === undefined && <div className="flex-1" />}
      <LegalNotice />
    </>
  );
}
