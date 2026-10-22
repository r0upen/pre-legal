import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyValues, type NdaValues } from "@/lib/nda";
import NdaBuilder, { GREETING } from "./NdaBuilder";

const standardTerms = readFileSync(path.join(__dirname, "..", "..", "templates", "mutual-nda.md"), "utf-8");

const complete: NdaValues = {
  purpose: "Evaluating a partnership.",
  effectiveDate: "2026-11-02",
  mndaExpires: true,
  mndaTermYears: 1,
  confidentialityPerpetual: false,
  confidentialityYears: 1,
  governingLaw: "Delaware",
  jurisdiction: "courts located in New Castle, DE",
  modifications: "None",
  party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "ada@acme.test" },
  party2: { name: "Alan Turing", title: "CTO", company: "Globex LLC", noticeAddress: "alan@globex.test" },
};

// Stands in for /api/chat: each call returns the next reply, or fails for null.
function mockChat(...turns: ({ reply: string; fields: NdaValues } | null)[]) {
  const fetchMock = vi.fn(async () => {
    const turn = turns.shift();
    return turn ? Response.json(turn) : new Response(null, { status: 502 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sentBody(fetchMock: ReturnType<typeof mockChat>, call: number) {
  const [url, init] = fetchMock.mock.calls[call] as unknown as [string, RequestInit];
  expect(url).toBe("/api/chat");
  return JSON.parse(init.body as string);
}

function setup() {
  const user = userEvent.setup();
  render(<NdaBuilder standardTerms={standardTerms} />);
  const preview = within(screen.getByRole("region", { name: "NDA preview" }));
  const send = async (text: string) => {
    await user.type(screen.getByLabelText("Your message"), text);
    await user.click(screen.getByRole("button", { name: "Send" }));
  };
  return { user, preview, send };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NdaBuilder", () => {
  it("starts with the greeting, the disclaimer and an empty agreement, without calling the backend", () => {
    const fetchMock = mockChat();
    const { preview } = setup();
    expect(screen.getByRole("log")).toHaveTextContent(GREETING);
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    expect(preview.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(preview.getByRole("heading", { level: 1, name: "Standard Terms" })).toBeInTheDocument();
    expect(preview.getByText("[Party 1 Company]")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Company" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the conversation and fills in the preview from the reply", async () => {
    const fields = { ...emptyValues, governingLaw: "Delaware", party1: { ...emptyValues.party1, company: "Acme Inc." } };
    const fetchMock = mockChat({ reply: "Who signs for Acme Inc.?", fields });
    const { preview, send } = setup();
    await send("Acme Inc., under Delaware law");

    const body = sentBody(fetchMock, 0);
    expect(body.messages).toEqual([
      { role: "assistant", content: GREETING },
      { role: "user", content: "Acme Inc., under Delaware law" },
    ]);
    expect(body.fields).toEqual(emptyValues);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await screen.findByText("Who signs for Acme Inc.?")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent("Acme Inc., under Delaware law");
    expect(preview.getByRole("cell", { name: "Acme Inc." })).toBeInTheDocument();
    expect(preview.getByText("Governing Law: Delaware")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("");
  });

  it("sends the collected fields back on the next turn", async () => {
    const first = { ...emptyValues, governingLaw: "Delaware" };
    const fetchMock = mockChat({ reply: "Noted.", fields: first }, { reply: "Thanks.", fields: first });
    const { send } = setup();
    await send("Delaware law");
    await screen.findByText("Noted.");
    await send("Courts in New Castle");
    await screen.findByText("Thanks.");

    const body = sentBody(fetchMock, 1);
    expect(body.fields).toEqual(first);
    expect(body.messages).toHaveLength(4);
  });

  it("enables the download only once every required detail is collected", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    mockChat({ reply: "The draft is ready to download.", fields: complete });
    const { user, send } = setup();
    const download = screen.getByRole("button", { name: "Download PDF" });
    expect(download).toBeDisabled();
    expect(screen.getByText(/Available once all required details/)).toBeInTheDocument();

    await send("Everything else is as you suggested");
    await screen.findByText("The draft is ready to download.");
    expect(download).toBeEnabled();
    expect(screen.queryByText(/Available once all required details/)).not.toBeInTheDocument();
    await user.click(download);
    expect(print).toHaveBeenCalledOnce();
  });

  it("keeps the message and the fields when the assistant fails, so it can be resent", async () => {
    const fields = { ...emptyValues, party1: { ...emptyValues.party1, company: "Acme Inc." } };
    const fetchMock = mockChat(null, { reply: "Who signs for Acme Inc.?", fields });
    const { user, preview, send } = setup();
    await send("Acme Inc.");

    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant could not respond");
    expect(screen.getByLabelText("Your message")).toHaveValue("Acme Inc.");
    expect(screen.getByRole("log")).not.toHaveTextContent("Acme Inc.");
    expect(preview.getByText("[Party 1 Company]")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Who signs for Acme Inc.?")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentBody(fetchMock, 1).messages).toEqual([
      { role: "assistant", content: GREETING },
      { role: "user", content: "Acme Inc." },
    ]);
  });

  it("disables sending while waiting for the assistant", async () => {
    let answer: (res: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const { send } = setup();
    await send("Acme Inc.");

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    answer(Response.json({ reply: "Thanks.", fields: emptyValues }));
    expect(await screen.findByText("Thanks.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toBeEnabled();
  });

  it("does not send a blank message", async () => {
    const fetchMock = mockChat();
    const { user } = setup();
    await user.type(screen.getByLabelText("Your message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("limits a message to the length the backend accepts", () => {
    setup();
    expect(screen.getByLabelText("Your message")).toHaveAttribute("maxLength", "4000");
  });

  it("includes the disclaimer in the printed PDF", () => {
    setup();
    expect(screen.getByText(/Draft prepared with Pre-Legal/)).toHaveClass("print:block");
  });
});
