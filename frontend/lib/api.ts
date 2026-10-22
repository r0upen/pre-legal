// Calls to the FastAPI backend. In production the backend also serves this app,
// so paths are relative; `npm run dev` points them at the backend on port 8000.
import type { NdaValues } from "./nda";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type User = { id: number; name: string; email: string };

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`${path} failed with status ${res.status}`);
  return res;
}

export async function getMutualNdaTerms(): Promise<string> {
  return (await request("/api/templates/mutual-nda")).text();
}

export async function login(name: string, email: string): Promise<User> {
  const res = await request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
  return res.json();
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatTurn = { reply: string; fields: NdaValues };

// The user's local date as YYYY-MM-DD, so "next Monday" follows their calendar.
function localToday(): string {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

export async function sendChat(messages: ChatMessage[], fields: NdaValues): Promise<ChatTurn> {
  const res = await request("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, fields, today: localToday() }),
  });
  return res.json();
}
