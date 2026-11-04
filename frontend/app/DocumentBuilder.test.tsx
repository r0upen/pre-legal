import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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

// Stands in for the backend: templates come from templates/, and each /api/chat or /api/choose
// call returns the next turn, or fails for null.
function mockBackend(...turns: (object | null)[]) {
  const fetchMock = vi.fn(async (url: string) => {
    const id = url.match(/^\/api\/templates\/(.+)$/)?.[1];
    if (id) return new Response(readFileSync(path.join(TEMPLATES, spec(id).files.at(-1)!), "utf-8"));
    const turn = turns.shift();
    return turn ? Response.json(turn) : new Response(null, { status: 502 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The n-th call to the chat backend (template downloads are skipped).
function sentBody(fetchMock: ReturnType<typeof mockBackend>, n: number, url = "/api/chat") {
  const calls = fetchMock.mock.calls.filter(([u]) => !u.startsWith("/api/templates/")) as unknown as [string, RequestInit][];
  expect(calls[n][0]).toBe(url);
  return JSON.parse(calls[n][1].body as string);
}

function setup() {
  const user = userEvent.setup();
  render(<DocumentBuilder documents={documents} />);
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
  return { user, preview, send, start };
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
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    for (const name of ["Mutual Non-Disclosure Agreement", "Cloud Service Agreement", "Professional Services Agreement"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "See all" })).toHaveAttribute("aria-expanded", "false");
    expect(preview.getByText(/Your draft will appear here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Change document" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Change document" })).toBeInTheDocument();
    expect(document.title).toBe("Mutual Non-Disclosure Agreement - Pre-Legal");
    // The clicked button is gone, so the cursor moves to the message box for the first answer.
    expect(screen.getByLabelText("Your message")).toHaveFocus();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/templates/mutual-nda"]);
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

  it("changes document only after the user confirms, clearing the answers", async () => {
    mockBackend({ reply: "Who signs for Acme?", fields: { ...emptyValues, party1: { ...emptyValues.party1, company: "Acme" } } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user, preview, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Acme");
    await screen.findByText("Who signs for Acme?");

    await user.click(screen.getByRole("button", { name: "Change document" }));
    expect(preview.getByRole("cell", { name: "Acme" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Change document" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(within(screen.getByRole("log")).getAllByRole("listitem")[0]).toHaveTextContent(OPENING);
    expect(screen.getByRole("log")).not.toHaveTextContent("Who signs for Acme?");
    expect(preview.getByText(/Your draft will appear here/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
    expect(document.title).toBe("Pre-Legal");
    expect(screen.getByLabelText("Your message")).toHaveFocus();
  });

  it("ignores a reply that arrives after the user changed document", async () => {
    let answer: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/templates/")
          ? new Response("# Standard Terms")
          : new Promise<Response>((resolve) => (answer = resolve)),
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, preview, send, start } = setup();
    await start("Mutual Non-Disclosure Agreement");
    await send("Acme Inc.");
    await user.click(screen.getByRole("button", { name: "Change document" }));

    answer(Response.json({ reply: "Who signs for Acme Inc.?", fields: emptyValues }));
    expect(await screen.findByRole("button", { name: "See all" })).toBeInTheDocument();
    expect(within(screen.getByRole("log")).getAllByRole("listitem").map((li) => li.textContent)[0]).toBe(OPENING);
    expect(screen.getByRole("log")).not.toHaveTextContent("Who signs for Acme Inc.?");
    expect(screen.getByRole("log")).not.toHaveTextContent("Acme Inc.");
    expect(preview.getByText(/Your draft will appear here/)).toBeInTheDocument();
  });

  it("keeps the download locked when the agreement's template cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/templates/") ? new Response(null, { status: 500 }) : Response.json({ reply: "Please confirm.", fields: complete }),
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
    mockBackend({ reply: "Please check the summary.", fields });
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

  it("enables the download only once every detail is collected and confirmed", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    mockBackend({ reply: "Please check the details and confirm them.", fields: complete });
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
      { reply: "Please check the details.", fields: complete },
      { reply: "You're welcome.", fields: complete },
      { reply: "Updated the MNDA term from 1 year to 2 years.", fields: changed },
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

  it("includes the disclaimer in the printed PDF", () => {
    setup();
    expect(screen.getByText(/Draft prepared with Pre-Legal/)).toHaveClass("print:block");
  });
});
