// Calls to the FastAPI backend. In production the backend also serves this app,
// so paths are relative; `npm run dev` points them at the backend on port 8000.
import type { DocValues, DocumentSpec } from "./documents";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type User = { id: number; name: string; email: string };

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`${path} failed with status ${res.status}`);
  return res;
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getDocuments(): Promise<DocumentSpec[]> {
  return (await request("/api/documents")).json();
}

export async function getStandardTerms(docId: string): Promise<string> {
  return (await request(`/api/templates/${docId}`)).text();
}

export function login(name: string, email: string): Promise<User> {
  return post("/api/login", { name, email });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatTurn = { reply: string; fields: DocValues };
export type ChooseTurn = { reply: string; recommendation: string | null };

// The user's local date as YYYY-MM-DD, so "next Monday" follows their calendar.
function localToday(): string {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

// One turn of choosing a document: the reply, plus the document the AI recommends (if any).
export function chooseDocument(messages: ChatMessage[]): Promise<ChooseTurn> {
  return post("/api/choose", { messages });
}

// One turn of the interview for the chosen document.
export function sendChat(document: string, messages: ChatMessage[], fields: DocValues): Promise<ChatTurn> {
  return post("/api/chat", { document, messages, fields, today: localToday() });
}
