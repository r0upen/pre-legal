// Calls to the FastAPI backend. In production the backend also serves this app,
// so paths are relative; `npm run dev` points them at the backend on port 8000.
import type { DocValues, DocumentSpec } from "./documents";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type User = { id: number; name: string; email: string };

export class ApiError extends Error {
  constructor(
    path: string,
    readonly status: number,
  ) {
    super(`${path} failed with status ${status}`);
  }
}

// Called on any 401, such as when a restart has wiped the session.
let onUnauthorized = () => {};
export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  // "include" sends the session cookie to the dev backend, which is on another port.
  const res = await fetch(`${API_URL}${path}`, { ...init, credentials: "include" });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) throw new ApiError(path, res.status);
  return res;
}

async function send<T>(method: "POST" | "PUT", path: string, body: object): Promise<T> {
  const res = await request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function post<T>(path: string, body: object): Promise<T> {
  return send("POST", path, body);
}

export async function getDocuments(): Promise<DocumentSpec[]> {
  return (await request("/api/documents")).json();
}

export async function getStandardTerms(docId: string): Promise<string> {
  return (await request(`/api/templates/${docId}`)).text();
}

export function signup(name: string, email: string, password: string): Promise<User> {
  return post("/api/signup", { name, email, password });
}

export function login(email: string, password: string): Promise<User> {
  return post("/api/login", { email, password });
}

export async function logout(): Promise<void> {
  await request("/api/logout", { method: "POST" });
}

export async function getMe(): Promise<User> {
  return (await request("/api/me")).json();
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

// What is saved for a draft: everything needed to reopen it where the user left off.
export type DraftState = { messages: ChatMessage[]; start: number; fields: DocValues; confirmed: boolean };
export type Draft = DraftState & { id: number; document: string; updatedAt: string };
// One sidebar item: parties holds the company names known so far.
export type DraftSummary = { id: number; document: string; parties: string[]; updatedAt: string };

export async function listDrafts(): Promise<DraftSummary[]> {
  return (await request("/api/drafts")).json();
}

// Saves run one at a time, so an older one can never land after a newer one. Reading a draft waits
// for them, or it could return a copy older than what the user just saw.
let saves: Promise<unknown> = Promise.resolve();

export async function getDraft(id: number): Promise<Draft> {
  await saves;
  return (await request(`/api/drafts/${id}`)).json();
}

export function createDraft(document: string, messages: ChatMessage[], start: number, fields: DocValues): Promise<DraftSummary> {
  return post("/api/drafts", { document, messages, start, fields });
}

export function updateDraft(id: number, state: DraftState): Promise<DraftSummary> {
  const saved = saves.then(() => send<DraftSummary>("PUT", `/api/drafts/${id}`, state));
  // A failed save must not stop the ones after it; the caller still sees the failure through saved.
  saves = saved.catch(() => {});
  return saved;
}
