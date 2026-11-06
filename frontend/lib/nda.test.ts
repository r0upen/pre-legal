import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCoverPage,
  buildNda,
  emptyValues,
  formatDate,
  stripSpans,
  summarize,
  type NdaValues,
} from "./nda";

const standardTerms = readFileSync(path.join(__dirname, "..", "..", "templates", "mutual-nda.md"), "utf-8");

const filled: NdaValues = {
  purpose: "Evaluating a partnership.",
  effectiveDate: "2026-03-05",
  mndaExpires: true,
  mndaTermYears: 1,
  confidentialityPerpetual: false,
  confidentialityYears: 1,
  modifications: null,
  governingLaw: "Delaware",
  jurisdiction: "courts located in New Castle, DE",
  party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "ada@acme.test" },
  party2: { name: "Alan Turing", title: "CTO", company: "Globex LLC", noticeAddress: "alan@globex.test" },
};

describe("formatDate", () => {
  it("formats an ISO date without timezone shifts", () => {
    expect(formatDate("2026-03-05")).toBe("March 5, 2026");
  });

  it("returns empty string for an empty or missing date", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate(null)).toBe("");
  });
});

describe("buildCoverPage", () => {
  it("shows placeholders for empty fields", () => {
    const md = buildCoverPage(emptyValues);
    expect(md).toContain("[Purpose]");
    expect(md).toContain("[Effective Date]");
    expect(md).toContain("Governing Law: [Governing Law state]");
    expect(md).toContain("[Party 1 Company]");
    expect(md).toContain("[Party 2 Print Name]");
  });

  it("fills in the parties and dates", () => {
    const md = buildCoverPage(filled);
    expect(md).toContain("March 5, 2026");
    expect(md).toContain("Governing Law: Delaware");
    expect(md).toContain("| Company | Acme Inc. | Globex LLC |");
    expect(md).toContain("| Print Name | Ada Lovelace | Alan Turing |");
  });

  it("checks the selected MNDA term", () => {
    expect(buildCoverPage({ ...filled, mndaTermYears: 2 })).toContain("- ☒ Expires 2 years from Effective Date.");
    const untilTerminated = buildCoverPage({ ...filled, mndaExpires: false });
    expect(untilTerminated).toContain("- ☐ Expires 1 year from Effective Date.");
    expect(untilTerminated).toContain("- ☒ Continues until terminated");
  });

  it("checks the selected term of confidentiality", () => {
    expect(buildCoverPage(filled)).toContain("- ☒ 1 year from Effective Date, but in the case of trade secrets");
    expect(buildCoverPage({ ...filled, confidentialityPerpetual: true })).toContain("- ☒ In perpetuity.");
  });

  it("ticks neither option for a term that has not been answered yet", () => {
    const md = buildCoverPage(emptyValues);
    expect(md).toContain("- ☐ Expires [number of years] from Effective Date.");
    expect(md).toContain("- ☐ Continues until terminated");
    expect(md).toContain("- ☐ [number of years] from Effective Date, but in the case of trade secrets");
    expect(md).toContain("- ☐ In perpetuity.");
  });

  it("keeps the party table intact when values contain pipes or line breaks", () => {
    const md = buildCoverPage({
      ...filled,
      party1: { ...filled.party1, noticeAddress: "1 Main St\nSuite | 2" },
    });
    expect(md).toContain("| Notice Address | 1 Main St Suite \\| 2 | alan@globex.test |");
  });

  it("says None when there are no modifications", () => {
    expect(buildCoverPage(filled)).toContain("### MNDA Modifications\n\nNone.");
    expect(buildCoverPage({ ...filled, modifications: "Section 8 is deleted." })).toContain("Section 8 is deleted.");
  });
});

describe("summarize", () => {
  it("lists every detail in readable form", () => {
    expect(summarize(filled)).toEqual([
      ["Party 1 company", "Acme Inc."],
      ["Party 1 signer", "Ada Lovelace, CEO"],
      ["Party 1 notice address", "ada@acme.test"],
      ["Party 2 company", "Globex LLC"],
      ["Party 2 signer", "Alan Turing, CTO"],
      ["Party 2 notice address", "alan@globex.test"],
      ["Purpose", "Evaluating a partnership."],
      ["Effective date", "March 5, 2026"],
      ["MNDA term", "Expires 1 year from the Effective Date"],
      ["Term of confidentiality", "1 year"],
      ["Governing law", "Delaware"],
      ["Jurisdiction", "courts located in New Castle, DE"],
      ["Modifications", "None"],
    ]);
  });

  it("describes the other term choices and modifications", () => {
    const rows = new Map(
      summarize({ ...filled, mndaExpires: false, confidentialityPerpetual: true, modifications: "Section 8 is deleted." }),
    );
    expect(rows.get("MNDA term")).toBe("Continues until terminated");
    expect(rows.get("Term of confidentiality")).toBe("In perpetuity");
    expect(rows.get("Modifications")).toBe("Section 8 is deleted.");
  });
});

describe("buildNda", () => {
  it("removes span tags but keeps their text", () => {
    expect(stripSpans('the <span class="coverpage_link">Purpose</span>.')).toBe("the Purpose.");
  });

  it("appends the standard terms after the cover page, without HTML", () => {
    const md = buildNda(filled, standardTerms);
    expect(md.indexOf("# Mutual Non-Disclosure Agreement")).toBe(0);
    expect(md).toContain("# Standard Terms");
    expect(md).toContain("governed by, and construed in accordance with, the laws of the State of Governing Law");
    expect(md).not.toContain("<span");
  });
});
