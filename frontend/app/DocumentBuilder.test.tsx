import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft } from "@/lib/api";
import { documentKind, type DocumentSpec } from "@/lib/documents";
import { emptyValues, type NdaValues } from "@/lib/nda";
import DocumentBuilder, { OPENING } from "./DocumentBuilder";

const TEMPLATES = path.join(__dirname, "..", "..", "templates");
const documents: DocumentSpec[] = JSON.parse(readFileSync(path.join(TEMPLATES, "catalog.json"), "utf-8"));
const spec = (id: string) => documents.find((d) => d.id === id)!;
const nda = documentKind(spec("mutual-nda"));
const csa = documentKind(spec("cloud-service-agreement"));

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

const summary = { id: 7, document: "mutual-nda", parties: [], updatedAt: "2026-11-04T12:00:00.000+00:00" };

// Stands in for the backend: templates come from templates/, saving a draft succeeds, and each
// /api/chat or /api/choose call returns the next turn, or fails for null.
function mockBackend(...turns: (object | null)[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const id = url.match(/^\/api\/templates\/(.+)$/)?.[1];
    if (id) return new Response(readFileSync(path.join(TEMPLATES, spec(id).files.at(-1)!), "utf-8"));
    if (url.startsWith("/api/drafts")) return Response.json(summary);
    const turn = turns.shift();
    return turn ? Response.json({ stage: "collecting", ...turn }) : new Response(null, { status: 502 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The n-th call to the chat backend (template downloads and saves are skipped).
function sentBody(fetchMock: ReturnType<typeof mockBackend>, n: number, url = "/api/chat") {
  const calls = fetchMock.mock.calls.filter(([u]) => /^\/api\/(chat|choose)$/.test(u)) as unknown as [string, RequestInit][];
  expect(calls[n][0]).toBe(url);
  return JSON.parse(calls[n][1].body as string);
}

// The bodies of the saves sent to the given URL.
function saves(fetchMock: ReturnType<typeof mockBackend>, url: string, method = "PUT") {
  const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
  return calls.filter(([u, init]) => u === url && init?.method === method).map(([, init]) => JSON.parse(init!.body as string));
}

function setup(saved: Draft | null = null) {
  const user = userEvent.setup();
  const onCreated = vi.fn();
  const onSaved = vi.fn();
  const view = render(<DocumentBuilder documents={documents} saved={saved} onCreated={onCreated} onSaved={onSaved} />);
  const preview = within(screen.getByRole("region", { name: "Document preview" }));
  const send = async (text: string) => {
    await user.type(screen.getByLabelText("Your message"), text);
    await user.click(screen.getByRole("button", { name: "Send" }));
  };
  // Taps a suggestion and waits for the agreement to appear in the preview.
  const start = async (name: string) => {
    await user.click(screen.getByRole("button", { name }));
    await preview.findByRole("heading", { level: 1, name: "Standard Terms" });
  };
  return { user, preview, send, start, onCreated, onSaved, view };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("choosing a document", () => {
  it("opens with suggestions and an empty preview, without calling the backend", () => {
    const fetchMock = mockBackend();
    const { preview } = setup();
    expect(screen.getByRole("log")).toHaveTextContent(OPENING);
    for (const name of ["Mutual Non-Disclosure Agreement", "Cloud Service Agreement", "Professional Services Agreement"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "See all" })).toHaveAttribute("aria-expanded", "false");
    expect(preview.getByText(/Your draft will appear here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("starts a suggested document when tapped", async () => {
    const fetchMock = mockBackend();
    const { preview, start } = setup();
    await start("Mutual Non-Disclosure Agreement");

    const log = screen.getByRole("log");
    expect(within(log).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      OPENING,
      "Mutual Non-Disclosure Agreement",
      nda.greeting,
    ]);
    expect(preview.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(preview.getByText("[Party 1 Company]")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See all" })).not.toBeInTheDocument();
    expect(document.title).toBe("Mutual Non-Disclosure Agreement - Pre-Legal");
    // The clicked button is gone, so the cursor moves to the message box for the first answer.
    expect(screen.getByLabelText("Your message")).toHaveFocus();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/drafts", "/api/templates/mutual-nda"]);
  });

  it("lists every agreement under See all", async () => {
    mockBackend();
    const { user, preview } = setup();
    await user.click(screen.getByRole("button", { name: "See all" }));
    const list = within(screen.getByRole("list", { name: "All agreements" }));
    expect(list.getAllByRole("button")).toHaveLength(documents.length);
    expect(list.getByText(spec("ai-addendum").description)).toBeInTheDocument();

    await user.click(list.getByRole("button", { name: /^AI Addendum/ }));
    expect(await preview.findByRole("heading", { level: 1, name: "AI Addendum" })).toBeInTheDocument();
  });

  it("asks the AI to recommend a document and starts it only when the user clicks Start", async () => {
    const recommendation = { reply: "A Cloud Service Agreement fits. Click Start below.", recommendation: "cloud-service-agreement" };
    const fetchMock = mockBackend(recommendation, { reply: "Who signs for Acme Cloud?", fields: csa.empty });
    const { user, preview, send } = setup();
    await send("We sell our SaaS product to businesses");

    expect(sentBody(fetchMock, 0, "/api/choose")).toEqual({
      messages: [
        { role: "assistant", content: OPENING },
        { role: "user", content: "We sell our SaaS product to businesses" },
      ],
    });
    expect(await screen.findByText(recommendation.reply)).toBeInTheDocument();
    expect(preview.getByText(/Your draft will appear here/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start Cloud Service Agreement" }));
    expect(await preview.findByRole("heading", { level: 1, name: "Cloud Service Agreement" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Start/ })).not.toBeInTheDocument();

    // The interview starts at the greeting, with the routine terms already at their defaults.
    await send("Acme Cloud Inc.");
    await screen.findByText("Who signs for Acme Cloud?");
    const body = sentBody(fetchMock, 1);
    expect(body.document).toBe("cloud-service-agreement");
    expect(body.messages).toEqual([
      { role: "assistant", content: csa.greeting },
      { role: "user", content: "Acme Cloud Inc." },
    ]);
    expect(body.fields).toEqual(csa.empty);
    expect(body.fields.generalCapAmount).toBe("1 times the fees paid or payable in the 12 months before the claim");
  });

  it("shows no Start button when the AI recommends nothing", async () => {
    mockBackend({ reply: "Pre-Legal cannot draft a lease yet.", recommendation: null });
    const { send } = setup();
    await send("I need an office lease");
    await screen.findByText("Pre-Legal cannot draft a lease yet.");
    expect(screen.queryByRole("button", { name: /^Start/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
  });

  it("keeps the download locked when the agreement's template cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/templates/") ? new Response(null, { status: 500 }) : Response.json({ reply: "Please confirm.", fields: complete, stage: "review" }),
      ),
    );
    const { user, preview, send } = setup();
    await user.click(screen.getByRole("button", { name: "Mutual Non-Disclosure Agreement" }));
    expect(await preview.findByText(/Could not load this agreement's template/)).toBeInTheDocument();

    await send("All done");
    await screen.findByText("Please confirm.");
    expect(preview.getByText(/Could not load this agreement's template/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm details" }));
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });

  it("marks the terms left at their defaults in the summary", async () => {
    const parties = {
      party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Cloud Inc.", noticeAddress: "1 Main St, Dover, DE 19901" },
      party2: { name: "Alan Turing", title: "CTO", company: "Globex LLC", noticeAddress: "2 Side St, Austin, TX 73301" },
    };
    const fields = {
      ...csa.empty,
      ...parties,
      cloudService: "Acme Analytics",
      orderDate: "2026-12-01",
      subscriptionPeriod: "1 year",
      fees: "$1,000 per month",
      paymentProcess: "Invoiced monthly, due in 30 days",
      effectiveDate: "2026-12-01",
      governingLaw: "Delaware",
      chosenCourts: "courts located in New Castle, DE",
      technicalSupport: "24/7 phone support",
    };
    mockBackend({ reply: "Please check the summary.", fields, stage: "review" });
    const { send, start } = setup();
    await start("Cloud Service Agreement");
    await send("Everything else as suggested");
    await screen.findByText("Please check the summary.");

    const summary = within(screen.getByRole("region", { name: "Check the details" }));
    expect(summary.getByText(/marks Common Paper's usual term/)).toBeInTheDocument();
    const row = (label: string) => summary.getByText(label).nextElementSibling!;
    expect(row("General Cap Amount")).toHaveTextContent(/Default$/);
    expect(row("Technical Support")).toHaveTextContent("24/7 phone support");
    expect(row("Technical Support")).not.toHaveTextContent("Default");
    expect(row("Fees")).not.toHaveTextContent("Default");
    expect(row("Order Date")).toHaveTextContent("December 1, 2026");
  });
});

describe("the interview", () => {
  it("sends the conversation and fills in the preview from the reply", async () => {
    const fields = { ...emptyValues, governingLaw: "Delaware", party1: { ...emptyValues.party1, company: "Acme Inc." } };
    const fetchMock = mockBackend({ reply: "Who signs for Acme Inc.?", fields });
    const { preview, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Acme Inc., under Delaware law");

    const body = sentBody(fetchMock, 0);
    expect(body.document).toBe("mutual-nda");
    expect(body.messages).toEqual([
      { role: "assistant", content: nda.greeting },
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
    const fetchMock = mockBackend({ reply: "Noted.", fields: first }, { reply: "Thanks.", fields: first });
    const { send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Delaware law");
    await screen.findByText("Noted.");
    await send("Courts in New Castle");
    await screen.findByText("Thanks.");

    const body = sentBody(fetchMock, 1);
    expect(body.fields).toEqual(first);
    expect(body.messages).toHaveLength(4);
  });

  it("shows no summary until the changes question is answered, and sends the stage back", async () => {
    const fetchMock = mockBackend(
      { reply: "Any changes?", fields: complete, stage: "changes" },
      { reply: "Please check the details.", fields: complete, stage: "review" },
    );
    const { send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("The last detail");
    await screen.findByText("Any changes?");
    expect(screen.queryByRole("region", { name: "Check the details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.getByText(/Available once you answer the question about changes/)).toBeInTheDocument();
    expect(sentBody(fetchMock, 0).stage).toBe("collecting");

    await send("No");
    await screen.findByText("Please check the details.");
    expect(screen.getByRole("region", { name: "Check the details" })).toBeInTheDocument();
    expect(sentBody(fetchMock, 1).stage).toBe("changes");
  });

  it("cannot be confirmed while a reply is on its way", async () => {
    const backend = mockBackend({ reply: "Please check the details.", fields: complete, stage: "review" });
    const { user, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("No");
    const confirm = await screen.findByRole("button", { name: "Confirm details" });
    expect(confirm).toBeEnabled();

    // Only the next chat reply is held back: saves must still finish, or they block later tests.
    let release: (reply: Response) => void = () => {};
    const held = new Promise<Response>((resolve) => (release = resolve));
    vi.stubGlobal("fetch", (url: string) => (url === "/api/chat" ? held : backend(url)));
    await send("Change the term");
    expect(confirm).toBeDisabled();
    await user.click(confirm);
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    release(Response.json({ reply: "Done.", fields: complete, stage: "review" }));
    await screen.findByText("Done.");
    expect(confirm).toBeEnabled();
  });

  it("enables the download only once every detail is collected and confirmed", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    mockBackend({ reply: "Please check the details and confirm them.", fields: complete, stage: "review" });
    const { user, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    const download = screen.getByRole("button", { name: "Download PDF" });
    expect(download).toBeDisabled();
    expect(screen.getByText(/Available once all required details/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Check the details" })).not.toBeInTheDocument();

    await send("Everything else is as you suggested");
    await screen.findByText("Please check the details and confirm them.");
    const summary = within(screen.getByRole("region", { name: "Check the details" }));
    expect(summary.getByText("Ada Lovelace, CEO")).toBeInTheDocument();
    expect(summary.getByText("Expires 1 year from the Effective Date")).toBeInTheDocument();
    expect(summary.queryByText(/marks Common Paper's usual term/)).not.toBeInTheDocument();
    expect(download).toBeDisabled();
    expect(screen.getByText(/Available once you confirm the details/)).toBeInTheDocument();

    await user.click(summary.getByRole("button", { name: "Confirm details" }));
    expect(screen.queryByRole("region", { name: "Check the details" })).not.toBeInTheDocument();
    expect(download).toBeEnabled();
    expect(download).toHaveFocus();
    expect(screen.queryByText(/Available once/)).not.toBeInTheDocument();
    await user.click(download);
    expect(print).toHaveBeenCalledOnce();
  });

  it("asks for a new confirmation after a change, but not after a turn without one", async () => {
    const changed = { ...complete, mndaTermYears: 2 };
    mockBackend(
      { reply: "Please check the details.", fields: complete, stage: "review" },
      { reply: "You're welcome.", fields: complete, stage: "confirmed" },
      { reply: "Updated the MNDA term from 1 year to 2 years.", fields: changed, stage: "review" },
    );
    const { user, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    const download = screen.getByRole("button", { name: "Download PDF" });
    await send("No modifications");
    await screen.findByText("Please check the details.");
    await user.click(screen.getByRole("button", { name: "Confirm details" }));

    await send("Thanks");
    await screen.findByText("You're welcome.");
    expect(download).toBeEnabled();

    await send("Make the term 2 years");
    await screen.findByText("Updated the MNDA term from 1 year to 2 years.");
    expect(download).toBeDisabled();
    const summary = within(screen.getByRole("region", { name: "Check the details" }));
    expect(summary.getByText("Expires 2 years from the Effective Date")).toBeInTheDocument();
  });

  it("keeps the message and the fields when the assistant fails, so it can be resent", async () => {
    const fields = { ...emptyValues, party1: { ...emptyValues.party1, company: "Acme Inc." } };
    const fetchMock = mockBackend(null, { reply: "Who signs for Acme Inc.?", fields });
    const { user, preview, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Acme Inc.");

    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant could not respond");
    expect(screen.getByLabelText("Your message")).toHaveValue("Acme Inc.");
    expect(screen.getByRole("log")).not.toHaveTextContent("Acme Inc.");
    expect(preview.getByText("[Party 1 Company]")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Who signs for Acme Inc.?")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sentBody(fetchMock, 1).messages).toEqual([
      { role: "assistant", content: nda.greeting },
      { role: "user", content: "Acme Inc." },
    ]);
  });
});

describe("the chat box", () => {
  it("locks the box while waiting for the assistant", async () => {
    let answer: (res: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const { send } = setup();
    await send("I need an NDA");

    expect(screen.getByText("Assistant is typing")).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    answer(Response.json({ reply: "Thanks.", recommendation: null }));
    expect(await screen.findByText("Thanks.")).toBeInTheDocument();
    expect(screen.queryByText("Assistant is typing")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).not.toHaveAttribute("readonly");
  });

  // Browsers move focus off a disabled field, so the box must never be disabled (checked above)
  // and clicking Send must not leave focus on the button.
  it.each(["clicking Send", "pressing Enter"])("keeps the cursor in the message box after %s", async (how) => {
    mockBackend({ reply: "Thanks.", recommendation: null });
    const { user, send } = setup();
    const box = screen.getByLabelText("Your message");
    if (how === "clicking Send") await send("I need an NDA");
    else await user.type(box, "I need an NDA{Enter}");
    await screen.findByText("Thanks.");
    expect(box).toHaveFocus();
    expect(box).toHaveValue("");
  });

  it.each([
    ["with a mouse", true],
    ["on a touch screen", false],
  ])("starts in the message box only %s", (_, fine) => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" && fine }));
    setup();
    expect(document.activeElement === screen.getByLabelText("Your message")).toBe(fine);
  });

  it("starts a new line with Shift+Enter instead of sending", async () => {
    const fetchMock = mockBackend({ reply: "Thanks.", recommendation: null });
    const { user } = setup();
    await user.type(screen.getByLabelText("Your message"), "1 Main St{Shift>}{Enter}{/Shift}Springfield");
    expect(fetchMock).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await screen.findByText("Thanks.");
    expect(sentBody(fetchMock, 0, "/api/choose").messages[1]).toEqual({ role: "user", content: "1 Main St\nSpringfield" });
  });

  it("does not send a blank message", async () => {
    const fetchMock = mockBackend();
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

});

describe("the printed PDF", () => {
  it("carries the disclaimer above the agreement", async () => {
    mockBackend();
    const { preview, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    const notice = screen.getByText(/Draft prepared with Pre-Legal/);
    expect(notice).toHaveClass("print:block");
    expect(notice).toHaveTextContent("not legal advice");
    const title = preview.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" });
    expect(notice.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("saving", () => {
  const started = () => [
    { role: "assistant", content: OPENING },
    { role: "user", content: "Mutual Non-Disclosure Agreement" },
    { role: "assistant", content: nda.greeting },
  ];

  it("creates the draft when a document starts, with the chat so far", async () => {
    const fetchMock = mockBackend();
    const { start, onCreated, onSaved } = setup();
    await start("Mutual Non-Disclosure Agreement");
    expect(saves(fetchMock, "/api/drafts", "POST")).toEqual([
      { document: "mutual-nda", messages: started(), start: 2, fields: emptyValues },
    ]);
    expect(onCreated).toHaveBeenCalledWith(7);
    expect(onSaved).toHaveBeenCalledWith(summary);
  });

  it("does not save while the user is still choosing a document", async () => {
    const fetchMock = mockBackend({ reply: "Which party are you?", recommendation: null });
    const { send } = setup();
    await send("I need something");
    await screen.findByText("Which party are you?");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/choose"]);
  });

  it("stays on the choices and shows an error when the draft cannot be created", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const { user, onCreated } = setup();
    await user.click(screen.getByRole("button", { name: "Mutual Non-Disclosure Agreement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start this agreement");
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("saves after every answer and after Confirm details", async () => {
    const fetchMock = mockBackend({ reply: "Please check the details.", fields: complete, stage: "review" });
    const { user, send, start, onSaved } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("All done");
    await screen.findByText("Please check the details.");

    const answered = [...started(), { role: "user", content: "All done" }, { role: "assistant", content: "Please check the details." }];
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(saves(fetchMock, "/api/drafts/7")).toEqual([{ messages: answered, start: 2, fields: complete, stage: "review" }]);

    await user.click(screen.getByRole("button", { name: "Confirm details" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(3));
    expect(saves(fetchMock, "/api/drafts/7")[1]).toEqual({ messages: answered, start: 2, fields: complete, stage: "confirmed" });
  });

  it("saves a cleared confirmation when an answer changes a detail", async () => {
    const changed = { ...complete, mndaTermYears: 2 };
    const fetchMock = mockBackend({ reply: "Check it.", fields: complete, stage: "review" }, { reply: "Updated.", fields: changed, stage: "review" });
    const { user, send, start, onSaved } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Done");
    await screen.findByText("Check it.");
    await user.click(screen.getByRole("button", { name: "Confirm details" }));
    await send("Make it 2 years");
    await screen.findByText("Updated.");
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(4));
    expect(saves(fetchMock, "/api/drafts/7").at(-1)).toMatchObject({ fields: changed, stage: "review" });
  });

  it("warns when a save fails, keeps the reply, and clears the warning after the next save", async () => {
    let saveOk = false;
    const answers = [
      { reply: "First reply.", fields: emptyValues },
      { reply: "Second reply.", fields: emptyValues },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/templates/")) return new Response("# Standard Terms");
        if (url === "/api/drafts") return Response.json(summary);
        if (init?.method === "PUT") return saveOk ? Response.json(summary) : new Response(null, { status: 500 });
        return Response.json(answers.shift());
      }),
    );
    const { send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("One");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    expect(screen.getByText("First reply.")).toBeInTheDocument();

    saveOk = true;
    await send("Two");
    await screen.findByText("Second reply.");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("drops a reply that arrives after the user moved to another document", async () => {
    let answer: (res: Response) => void = () => {};
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/templates/")) return new Response("# Standard Terms");
      if (url.startsWith("/api/drafts")) return Response.json(summary);
      return new Promise<Response>((resolve) => (answer = resolve));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { send, start, view } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Acme Inc.");
    view.unmount();

    answer(Response.json({ reply: "Too late.", fields: emptyValues }));
    await new Promise((resolve) => setTimeout(resolve));
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/drafts/7")).toEqual([]);
  });
});

describe("reopening a draft", () => {
  const saved = (change: Partial<Draft> = {}): Draft => ({
    id: 7,
    document: "mutual-nda",
    messages: [
      { role: "assistant", content: OPENING },
      { role: "user", content: "Mutual Non-Disclosure Agreement" },
      { role: "assistant", content: nda.greeting },
      { role: "user", content: "Acme Inc." },
      { role: "assistant", content: "Who signs for Acme Inc.?" },
    ],
    start: 2,
    fields: { ...emptyValues, party1: { ...emptyValues.party1, company: "Acme Inc." } },
    stage: "collecting",
    updatedAt: "2026-11-04T12:00:00.000+00:00",
    ...change,
  });

  it("shows the conversation and the document, and creates nothing", async () => {
    const fetchMock = mockBackend();
    const { preview, onCreated } = setup(saved());
    expect(screen.getByRole("log")).toHaveTextContent("Who signs for Acme Inc.?");
    expect(await preview.findByRole("cell", { name: "Acme Inc." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "See all" })).not.toBeInTheDocument();
    expect(document.title).toBe("Mutual Non-Disclosure Agreement - Pre-Legal");
    expect(saves(fetchMock, "/api/drafts", "POST")).toEqual([]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("continues the interview where it stopped, saving to the same draft", async () => {
    const draft = saved();
    const fetchMock = mockBackend({ reply: "And the title?", fields: draft.fields });
    const { send, onSaved } = setup(draft);
    await send("Ada Lovelace");
    await screen.findByText("And the title?");

    // The AI sees the interview only, from the greeting on, as it did before reopening.
    expect(sentBody(fetchMock, 0).messages.slice(0, 3)).toEqual(draft.messages.slice(2));
    expect(sentBody(fetchMock, 0).fields).toEqual(draft.fields);
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saves(fetchMock, "/api/drafts/7")).toHaveLength(1);
  });

  it("opens a confirmed draft ready to download, without taking focus from the message box", async () => {
    mockBackend();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(pointer: fine)" }));
    const { preview } = setup(saved({ fields: complete, stage: "confirmed" }));
    await preview.findByRole("heading", { level: 1, name: "Standard Terms" });
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Check the details" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveFocus();
  });

  it("shows the summary again for a complete draft that was not confirmed", async () => {
    mockBackend();
    setup(saved({ fields: complete, stage: "review" }));
    expect(screen.getByRole("region", { name: "Check the details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
  });
});
