import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStoredUser } from "@/lib/session";
import App from "./App";
import { OPENING } from "./DocumentBuilder";

const ada = { id: 1, name: "Ada Lovelace", email: "ada@example.com" };

const documents = [{ id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", description: "Share secrets.", version: "1.0", files: [] }];

// Stands in for the backend: answers the two /api routes the app calls on its own.
function mockBackend({ loginOk = true, documentsOk = true } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/login") return loginOk ? Response.json(ada) : new Response(null, { status: 422 });
    return documentsOk ? Response.json(documents) : new Response(null, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("App", () => {
  it("shows the sign-in screen with the disclaimer when no one is signed in", () => {
    const fetchMock = mockBackend();
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    expect(screen.queryByRole("region", { name: "NDA preview" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a malformed stored user as signed out", () => {
    mockBackend();
    sessionStorage.setItem("pre-legal.user", "not json");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
  });

  it("signs in and shows the builder with the agreements from the backend", async () => {
    const fetchMock = mockBackend();
    render(<App />);
    await signIn();

    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as")).toHaveTextContent("Ada Lovelace");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.com" }) }),
    );
    expect(JSON.parse(sessionStorage.getItem("pre-legal.user")!)).toEqual(ada);
  });

  it("skips sign-in when the user is already stored for this tab", async () => {
    const fetchMock = mockBackend();
    setStoredUser(ada);
    render(<App />);
    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.getByText(/Tell the assistant what you need/)).toBeInTheDocument();
    // Only the list of agreements is loaded; the chat waits for the user.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/documents"]);
  });

  it("signs out back to the sign-in screen", async () => {
    mockBackend();
    setStoredUser(ada);
    render(<App />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
    expect(sessionStorage.getItem("pre-legal.user")).toBeNull();
  });

  it("shows an error when sign-in fails", async () => {
    mockBackend({ loginOk: false });
    render(<App />);
    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in failed");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("shows an error when the agreements cannot be loaded", async () => {
    mockBackend({ documentsOk: false });
    setStoredUser(ada);
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the agreements");
  });
});
