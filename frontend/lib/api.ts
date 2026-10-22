// Calls to the FastAPI backend. In production the backend also serves this app,
// so paths are relative; `npm run dev` points them at the backend on port 8000.
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
