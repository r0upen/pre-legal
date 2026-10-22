"use client";

import { useState } from "react";
import { login, type User } from "@/lib/api";
import { inputClass } from "./NdaForm";

export default function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      onLogin(await login(name, email));
    } catch {
      setError("Sign-in failed. Check your name and email and try again.");
      setPending(false);
    }
  }

  return (
    <section className="mx-auto mt-16 w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-navy">Sign in to Pre-Legal</h1>
      <p className="mt-1 text-sm text-slate-600">Placeholder sign-in: there is no password and nothing is verified.</p>
      <p role="note" className="mt-4 rounded-md border-l-4 border-teal bg-teal/10 p-3 text-sm text-slate-700">
        Drafts are a starting point for review by a lawyer. They are not legal advice.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            required
            type="email"
            className={inputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-teal disabled:opacity-60"
        >
          {pending ? "Signing in..." : "Continue"}
        </button>
      </form>
    </section>
  );
}
