import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setStoredUser } from "@/lib/session";
import NdaApp from "./NdaApp";

const ada = { id: 1, name: "Ada Lovelace", email: "ada@example.com" };

// Stands in for the backend: answers the two /api routes the app calls.
function mockBackend({ loginOk = true, termsOk = true } = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/login") return loginOk ? Response.json(ada) : new Response(null, { status: 422 });
    return termsOk ? new Response("# Standard Terms") : new Response(null, { status: 500 });
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

describe("NdaApp", () => {
  it("shows the sign-in screen with the disclaimer when no one is signed in", () => {
    const fetchMock = mockBackend();
    render(<NdaApp />);
    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    expect(screen.queryByRole("region", { name: "NDA preview" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a malformed stored user as signed out", () => {
    mockBackend();
    sessionStorage.setItem("pre-legal.user", "not json");
    render(<NdaApp />);
    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
  });

  it("signs in and shows the NDA builder with the terms from the backend", async () => {
    const fetchMock = mockBackend();
    render(<NdaApp />);
    await signIn();

    expect(await screen.findByRole("heading", { name: "Standard Terms" })).toBeInTheDocument();
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
    render(<NdaApp />);
    expect(await screen.findByRole("heading", { name: "Standard Terms" })).toBeInTheDocument();
    expect(screen.getByText(/Chat with the assistant and the agreement fills in as you answer/)).toBeInTheDocument();
    // Only the template is loaded; the chat waits for the user's first message.
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/templates/mutual-nda"]);
  });

  it("signs out back to the sign-in screen", async () => {
    mockBackend();
    setStoredUser(ada);
    render(<NdaApp />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("heading", { name: "Sign in to Pre-Legal" })).toBeInTheDocument();
    expect(sessionStorage.getItem("pre-legal.user")).toBeNull();
  });

  it("shows an error when sign-in fails", async () => {
    mockBackend({ loginOk: false });
    render(<NdaApp />);
    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign-in failed");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("shows an error when the template cannot be loaded", async () => {
    mockBackend({ termsOk: false });
    setStoredUser(ada);
    render(<NdaApp />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the NDA template");
  });
});
