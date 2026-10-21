// Builds the Mutual NDA as Markdown: a cover page generated from form values,
// followed by the Common Paper standard terms from templates/mutual-nda.md.

export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type NdaValues = {
  purpose: string;
  effectiveDate: string; // YYYY-MM-DD from <input type="date">, or ""
  mndaExpires: boolean;
  mndaTermYears: number;
  confidentialityPerpetual: boolean;
  confidentialityYears: number;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

const emptyParty: Party = { name: "", title: "", company: "", noticeAddress: "" };

export const defaultValues: NdaValues = {
  purpose: "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: "",
  mndaExpires: true,
  mndaTermYears: 1,
  confidentialityPerpetual: false,
  confidentialityYears: 1,
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  party1: emptyParty,
  party2: emptyParty,
};

// Empty fields show as bracketed placeholders, like the original template.
function orPlaceholder(value: string, label: string): string {
  return value.trim() || `[${label}]`;
}

// Table cells cannot contain pipes or line breaks.
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function years(n: number): string {
  return n === 1 ? "1 year" : `${n} years`;
}

function checkbox(checked: boolean): string {
  return checked ? "- ☒" : "- ☐";
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildCoverPage(v: NdaValues): string {
  const partyRow = (label: string, key: keyof Party) =>
    `| ${label} | ${cell(orPlaceholder(v.party1[key], `Party 1 ${label}`))} | ${cell(orPlaceholder(v.party2[key], `Party 2 ${label}`))} |`;

  return [
    "# Mutual Non-Disclosure Agreement",
    "## Using This Mutual Non-Disclosure Agreement",
    "This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“**Cover Page**”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“**Standard Terms**”) identical to those posted at [commonpaper.com/standards/mutual-nda/1.0](https://commonpaper.com/standards/mutual-nda/1.0). Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.",
    "### Purpose",
    orPlaceholder(v.purpose, "Purpose"),
    "### Effective Date",
    formatDate(v.effectiveDate) || "[Effective Date]",
    "### MNDA Term",
    [
      `${checkbox(v.mndaExpires)} Expires ${years(v.mndaTermYears)} from Effective Date.`,
      `${checkbox(!v.mndaExpires)} Continues until terminated in accordance with the terms of the MNDA.`,
    ].join("\n"),
    "### Term of Confidentiality",
    [
      `${checkbox(!v.confidentialityPerpetual)} ${years(v.confidentialityYears)} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`,
      `${checkbox(v.confidentialityPerpetual)} In perpetuity.`,
    ].join("\n"),
    "### Governing Law & Jurisdiction",
    `Governing Law: ${orPlaceholder(v.governingLaw, "Governing Law state")}`,
    `Jurisdiction: ${orPlaceholder(v.jurisdiction, "Jurisdiction, e.g. courts located in New Castle, DE")}`,
    "### MNDA Modifications",
    v.modifications.trim() || "None.",
    "By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.",
    [
      "| | PARTY 1 | PARTY 2 |",
      "|:--- | :---- | :---- |",
      "| Signature | | |",
      partyRow("Print Name", "name"),
      partyRow("Title", "title"),
      partyRow("Company", "company"),
      partyRow("Notice Address", "noticeAddress"),
      "| Date | | |",
    ].join("\n"),
  ].join("\n\n");
}

// The standard terms mark cover page references with <span> tags; keep the text.
export function stripSpans(markdown: string): string {
  return markdown.replace(/<\/?span[^>]*>/g, "");
}

export function buildNda(values: NdaValues, standardTerms: string): string {
  return `${buildCoverPage(values)}\n\n${stripSpans(standardTerms)}`;
}
