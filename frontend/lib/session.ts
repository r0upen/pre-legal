// The signed-in user, kept in sessionStorage for the browser tab.
// Placeholder sign-in only: this is not an auth token.
import { useSyncExternalStore } from "react";
import type { User } from "./api";

const KEY = "pre-legal.user";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setStoredUser(user: User | null) {
  if (user) sessionStorage.setItem(KEY, JSON.stringify(user));
  else sessionStorage.removeItem(KEY);
  listeners.forEach((listener) => listener());
}

// A value that is not valid JSON counts as signed out, rather than crashing the page.
function parseUser(stored: string | null): User | null {
  try {
    return stored ? (JSON.parse(stored) as User) : null;
  } catch {
    return null;
  }
}

// Returns undefined while prerendering at build time, when there is no
// sessionStorage, so the page can render nothing until it knows.
export function useStoredUser(): User | null | undefined {
  const stored = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(KEY),
    () => undefined,
  );
  return stored === undefined ? undefined : parseUser(stored);
}
