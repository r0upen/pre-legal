import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NdaBuilder from "./NdaBuilder";

const standardTerms = readFileSync(path.join(__dirname, "..", "..", "templates", "mutual-nda.md"), "utf-8");

function setup() {
  const user = userEvent.setup();
  render(<NdaBuilder standardTerms={standardTerms} />);
  const preview = within(screen.getByRole("region", { name: "NDA preview" }));
  return { user, preview };
}

describe("NdaBuilder", () => {
  it("renders the full agreement with the disclaimer", () => {
    const { preview } = setup();
    expect(screen.getByRole("note")).toHaveTextContent("not legal advice");
    expect(preview.getByRole("heading", { level: 1, name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(preview.getByRole("heading", { level: 1, name: "Standard Terms" })).toBeInTheDocument();
    expect(preview.getByText("[Party 1 Company]")).toBeInTheDocument();
  });

  it("updates the preview as the user types", async () => {
    const { user, preview } = setup();
    const [party1Company] = screen.getAllByLabelText("Company");
    await user.type(party1Company, "Acme Inc.");
    await user.type(screen.getByLabelText("Governing law (state)"), "Delaware");

    expect(preview.getByRole("cell", { name: "Acme Inc." })).toBeInTheDocument();
    expect(preview.queryByText("[Party 1 Company]")).not.toBeInTheDocument();
    expect(preview.getByText("Governing Law: Delaware")).toBeInTheDocument();
  });

  it("switches the MNDA term option", async () => {
    const { user, preview } = setup();
    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));

    expect(preview.getByText(/Continues until terminated in accordance/)).toHaveTextContent(/^☒/);
    expect(preview.getByText(/Expires 1 year from Effective Date/)).toHaveTextContent(/^☐/);
    expect(screen.getByLabelText("MNDA term in years")).toBeDisabled();
  });

  it("changes the number of years", async () => {
    const { user, preview } = setup();
    await user.selectOptions(screen.getByLabelText("MNDA term in years"), "2");
    expect(preview.getByText(/Expires 2 years from Effective Date/)).toHaveTextContent(/^☒/);
  });

  it("includes the disclaimer in the printed PDF", () => {
    setup();
    expect(screen.getByText(/Draft prepared with Pre-Legal/)).toHaveClass("print:block");
  });

  it("opens the print dialog to download the PDF", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });
});
