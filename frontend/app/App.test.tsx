import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyValues } from "@/lib/nda";
import App from "./App";
import { OPENING } from "./DocumentBuilder";

const ada = { id: 1, name: "Ada Lovelace", email: "ada@example.com" };
const documents = [
  { id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", description: "Share secrets.", version: "1.0", files: [] },
];
const summary = { id: 7, document: "mutual-nda", parties: ["Acme Inc.", "Globex LLC"], updatedAt: "2026-11-04T12:00:00.000Z" };
const draft = {
  id: 7,
  document: "mutual-nda",
  messages: [
    { role: "assistant", content: OPENING },
    { role: "user", content: "Mutual Non-Disclosure Agreement" },
    { role: "assistant", content: "Saved question?" },
  ],
  start: 2,
  fields: emptyValues,
  confirmed: false,
  updatedAt: summary.updatedAt,
};

type Options = {
  loggedIn?: boolean;
  // The status /api/login or /api/signup answers with.
  authStatus?: number;
  drafts?: (typeof summary)[];
  // Overrides for single routes, keyed by URL.
  routes?: Record<string, (init?: RequestInit) => Response | Promise<Response>>;
};

// Stands in for the backend. The routes the app calls on its own answer as a logged-in user would.
function mockBackend({ loggedIn = true, authStatus = 200, drafts = [], routes = {} }: Options = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (routes[url]) return routes[url](init);
    if (url === "/api/me") return loggedIn ? Response.json(ada) : new Response(null, { status: 401 });
    if (url === "/api/login" || url === "/api/signup") {
      return authStatus === 200 ? Response.json(ada) : new Response(null, { status: authStatus });
    }
    if (url === "/api/logout") return new Response(null, { status: 204 });
    if (url === "/api/documents") return Response.json(documents);
    if (url === "/api/drafts") return Response.json(drafts);
    if (url === "/api/drafts/7") return Response.json(draft);
    if (url.startsWith("/api/templates/")) return new Response("# Standard Terms");
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Logged out: fills in the form on the log in or sign up screen and submits it.
async function submit(fields: Record<string, string>, button: string) {
  const user = userEvent.setup();
  for (const [label, value] of Object.entries(fields)) await user.type(screen.getByLabelText(new RegExp(`^${label}`)), value);
  await user.click(screen.getByRole("button", { name: button }));
  return user;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logging in", () => {
  it("shows the log in screen with the notice when no one is logged in", async () => {
    const fetchMock = mockBackend({ loggedIn: false });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    expect(screen.queryByRole("region", { name: "Document preview" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/me"]);
  });

  it("logs in and shows the builder with the agreements from the backend", async () => {
    const fetchMock = mockBackend({ loggedIn: false });
    render(<App />);
    await screen.findByRole("heading", { name: "Log in" });
    await submit({ Email: "ada@example.com", Password: "correct horse" }, "Log in");

    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Your documents" })).toHaveTextContent("Ada Lovelace");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "ada@example.com", password: "correct horse" }),
      }),
    );
  });

  it("signs up from the link on the log in screen", async () => {
    const fetchMock = mockBackend({ loggedIn: false });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute("minLength", "8");

    await submit({ Name: "Ada Lovelace", Email: "ada@example.com", Password: "correct horse" }, "Sign up");
    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/signup",
      expect.objectContaining({ body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.com", password: "correct horse" }) }),
    );
  });

  it("skips the log in screen when the session is still valid", async () => {
    const fetchMock = mockBackend();
    render(<App />);
    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    // The chat waits for the user: only the session and the lists are loaded.
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual(["/api/documents", "/api/drafts", "/api/me"]);
  });

  it("says when the email or password is wrong", async () => {
    mockBackend({ loggedIn: false, authStatus: 401 });
    render(<App />);
    await screen.findByRole("heading", { name: "Log in" });
    await submit({ Email: "ada@example.com", Password: "wrong password" }, "Log in");
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });

  it("says when the email already has an account", async () => {
    mockBackend({ loggedIn: false, authStatus: 409 });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Create an account" }));
    await submit({ Name: "Ada", Email: "ada@example.com", Password: "correct horse" }, "Sign up");
    expect(await screen.findByRole("alert")).toHaveTextContent("already exists");
  });
});

describe("logging out", () => {
  it("returns to the log in screen", async () => {
    const fetchMock = mockBackend();
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", expect.objectContaining({ method: "POST" }));
  });

  it("clears the document's name from the page title", async () => {
    mockBackend({ drafts: [summary] });
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(OPENING);
    await user.click(within(screen.getByRole("navigation")).getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ }));
    await screen.findByText("Saved question?");
    expect(document.title).toBe("Mutual Non-Disclosure Agreement - Pre-Legal");

    await user.click(screen.getByRole("button", { name: "Log out" }));
    await screen.findByRole("heading", { name: "Log in" });
    expect(document.title).toBe("Pre-Legal");
  });

  it("stays logged in and says so when logging out fails", async () => {
    mockBackend({ routes: { "/api/logout": () => new Response(null, { status: 500 }) } });
    render(<App />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Log out" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not log you out");
    expect(screen.getByRole("navigation", { name: "Your documents" })).toBeInTheDocument();
  });

  it("returns to the log in screen when the session has ended", async () => {
    // The database reset on a restart: the page still looks logged in until the next request.
    mockBackend({
      drafts: [summary],
      routes: { "/api/drafts/7": () => new Response(null, { status: 401 }) },
    });
    render(<App />);
    const nav = within(await screen.findByRole("navigation", { name: "Your documents" }));
    await userEvent.setup().click(await nav.findByRole("button", { name: /^Mutual Non-Disclosure Agreement/ }));
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("the sidebar", () => {
  const sidebar = () => within(screen.getByRole("navigation", { name: "Your documents" }));

  it("says when there are no documents yet", async () => {
    mockBackend();
    render(<App />);
    expect(await screen.findByText(OPENING)).toBeInTheDocument();
    expect(sidebar().getByText("Documents you start will appear here.")).toBeInTheDocument();
  });

  it("lists each draft by name, parties and date", async () => {
    mockBackend({ drafts: [summary, { ...summary, id: 8, parties: [] }] });
    render(<App />);
    await screen.findByText(OPENING);
    const items = sidebar().getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Mutual Non-Disclosure Agreement");
    expect(items[0]).toHaveTextContent(/Acme Inc\. and Globex LLC, Nov \d/);
    expect(items[1]).toHaveTextContent(/AgreementNov \d/);
  });

  it("adds a started document to the list, marked as the open one", async () => {
    mockBackend({
      routes: { "/api/drafts": (init) => Response.json(init?.method === "POST" ? { ...summary, parties: [] } : []) },
    });
    render(<App />);
    await screen.findByText(OPENING);
    await userEvent.setup().click(screen.getByRole("button", { name: "Mutual Non-Disclosure Agreement" }));

    const item = await sidebar().findByRole("button", { name: /^Mutual Non-Disclosure Agreement/ });
    expect(item).toHaveAttribute("aria-current", "true");
  });

  it("reopens a draft with its conversation", async () => {
    mockBackend({ drafts: [summary] });
    render(<App />);
    await screen.findByText(OPENING);
    await userEvent.setup().click(sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ }));

    expect(await screen.findByText("Saved question?")).toBeInTheDocument();
    expect(sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ })).toHaveAttribute("aria-current", "true");
    expect(document.title).toBe("Mutual Non-Disclosure Agreement - Pre-Legal");
  });

  it("starts a fresh chat with New document, keeping the draft in the list", async () => {
    mockBackend({ drafts: [summary] });
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(OPENING);
    await user.click(sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ }));
    await screen.findByText("Saved question?");

    await user.click(sidebar().getByRole("button", { name: "New document" }));
    expect(screen.queryByText("Saved question?")).not.toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent(OPENING);
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
    expect(sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ })).not.toHaveAttribute("aria-current");
    expect(document.title).toBe("Pre-Legal");
  });

  it("waits for a save still running before reopening that draft", async () => {
    let finishSave: (res: Response) => void = () => {};
    const fetchMock = mockBackend({
      drafts: [summary],
      routes: {
        "/api/chat": () => Response.json({ reply: "Newest reply.", fields: emptyValues }),
        "/api/drafts/7": (init) =>
          init?.method === "PUT" ? new Promise<Response>((resolve) => (finishSave = resolve)) : Response.json(draft),
      },
    });
    const reads = () => fetchMock.mock.calls.filter(([url, init]) => url === "/api/drafts/7" && !init?.method);
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(OPENING);
    const item = () => sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ });
    await user.click(item());
    await screen.findByText("Saved question?");
    await user.type(screen.getByLabelText("Your message"), "Acme{Enter}");
    await screen.findByText("Newest reply.");

    await user.click(sidebar().getByRole("button", { name: "New document" }));
    await user.click(item());
    // Reading now could return the copy from before the save, and the next save would overwrite it.
    await new Promise((resolve) => setTimeout(resolve));
    expect(reads()).toHaveLength(1);

    finishSave(Response.json(summary));
    await waitFor(() => expect(reads()).toHaveLength(2));
  });

  it("does not reload the draft that is already open", async () => {
    const fetchMock = mockBackend({ drafts: [summary] });
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(OPENING);
    const item = sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ });
    await user.click(item);
    await screen.findByText("Saved question?");
    await user.click(item);
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/drafts/7")).toHaveLength(1);
  });

  it("keeps the current view and says so when a draft cannot be opened", async () => {
    mockBackend({ drafts: [summary], routes: { "/api/drafts/7": () => new Response(null, { status: 500 }) } });
    render(<App />);
    await screen.findByText(OPENING);
    await userEvent.setup().click(sidebar().getByRole("button", { name: /^Mutual Non-Disclosure Agreement/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not open that document");
    expect(screen.getByRole("log")).toHaveTextContent(OPENING);
  });

  it("opens and closes on narrow screens", async () => {
    mockBackend();
    render(<App />);
    const user = userEvent.setup();
    await screen.findByText(OPENING);
    const menu = screen.getByRole("button", { name: "Open menu" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("navigation", { name: "Your documents" })).toHaveClass("invisible");

    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("navigation", { name: "Your documents" })).not.toHaveClass("invisible");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(menu).toHaveAttribute("aria-expanded", "false"));
  });
});

describe("the notice", () => {
  it("shows on the workspace, and when the documents cannot be loaded", async () => {
    mockBackend({ routes: { "/api/documents": () => new Response(null, { status: 500 }) } });
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your documents");
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
  });

  it("shows while the app is still finding out who is logged in", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<App />);
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
  });
});
