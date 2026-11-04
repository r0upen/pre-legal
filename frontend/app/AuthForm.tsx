"use client";

import { useState } from "react";
import { ApiError, login, signup, type User } from "@/lib/api";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";
const labelClass = "block text-sm font-medium text-slate-700";

function errorMessage(err: unknown, signingUp: boolean): string {
  const status = err instanceof ApiError ? err.status : null;
  if (status === 401) return "Wrong email or password.";
  if (status === 409) return "An account with this email already exists. Log in instead.";
  if (status === 422) return "Check your details and try again.";
  return signingUp ? "Could not create your account. Try again." : "Could not log you in. Try again.";
}

export default function AuthForm({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [signingUp, setSigningUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      onAuthenticated(await (signingUp ? signup(name, email, password) : login(email, password)));
    } catch (err) {
      setError(errorMessage(err, signingUp));
      setPending(false);
    }
  }

  function switchMode() {
    setSigningUp(!signingUp);
    setError("");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold tracking-tight text-teal">Pre-Legal</p>
        <h1 className="mt-1 text-2xl font-semibold text-navy">{signingUp ? "Create your account" : "Log in"}</h1>
        <p className="mt-1 text-sm text-slate-600">Draft common legal agreements by chatting with an AI.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {signingUp && (
            <label className={labelClass}>
              Name
              <input
                required
                autoComplete="name"
                maxLength={100}
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label className={labelClass}>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Password
            <input
              required
              type="password"
              autoComplete={signingUp ? "new-password" : "current-password"}
              minLength={signingUp ? 8 : undefined}
              maxLength={128}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signingUp && <span className="mt-1 block text-xs font-normal text-slate-500">At least 8 characters.</span>}
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
            {signingUp ? "Sign up" : "Log in"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          {signingUp ? "Already have an account?" : "New to Pre-Legal?"}{" "}
          <button type="button" onClick={switchMode} className="font-medium text-teal hover:underline">
            {signingUp ? "Log in" : "Create an account"}
          </button>
        </p>
      </section>
    </div>
  );
}
