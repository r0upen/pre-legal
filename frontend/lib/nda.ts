// Builds the Mutual NDA as Markdown: a cover page generated from the values the chat
// has collected, followed by the Common Paper standard terms from templates/mutual-nda.md.
// The shape matches NdaFields in backend/app/chat.py; null means "not collected yet".

export type Party = {
  name: string | null;
  title: string | null;
  company: string | null;
  noticeAddress: string | null;
};

export type NdaValues = {
  purpose: string | null;
  effectiveDate: string | null; // YYYY-MM-DD
  mndaExpires: boolean | null;
  mndaTermYears: number | null;
  confidentialityPerpetual: boolean | null;
  confidentialityYears: number | null;
  governingLaw: string | null;
  jurisdiction: string | null;
  modifications: string | null;
  party1: Party;
  party2: Party;
};

const emptyParty: Party = { name: null, title: null, company: null, noticeAddress: null };

export const emptyValues: NdaValues = {
  purpose: null,
  effectiveDate: null,
  mndaExpires: null,
  mndaTermYears: null,
  confidentialityPerpetual: null,
  confidentialityYears: null,
  governingLaw: null,
  jurisdiction: null,
  modifications: null,
  party1: emptyParty,
  party2: emptyParty,
};

// Empty fields show as bracketed placeholders, like the original template.
function orPlaceholder(value: string | null, label: string): string {
  return value?.trim() || `[${label}]`;
}

// Table cells cannot contain pipes or line breaks.
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function years(n: number | null): string {
  if (n === null) return "[number of years]";
  return n === 1 ? "1 year" : `${n} years`;
}

function checkbox(checked: boolean): string {
  return checked ? "- ☒" : "- ☐";
}

export function formatDate(isoDate: string | null): string {
  const [y, m, d] = (isoDate ?? "").split("-").map(Number);
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
      `${checkbox(v.mndaExpires === true)} Expires ${years(v.mndaTermYears)} from Effective Date.`,
      `${checkbox(v.mndaExpires === false)} Continues until terminated in accordance with the terms of the MNDA.`,
    ].join("\n"),
    "### Term of Confidentiality",
    [
      `${checkbox(v.confidentialityPerpetual === false)} ${years(v.confidentialityYears)} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`,
      `${checkbox(v.confidentialityPerpetual === true)} In perpetuity.`,
    ].join("\n"),
    "### Governing Law & Jurisdiction",
    `Governing Law: ${orPlaceholder(v.governingLaw, "Governing Law state")}`,
    `Jurisdiction: ${orPlaceholder(v.jurisdiction, "Jurisdiction, e.g. courts located in New Castle, DE")}`,
    "### MNDA Modifications",
    v.modifications?.trim() || "None.",
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

// True once every required detail is collected; modifications are optional.
export function isComplete(v: NdaValues): boolean {
  const text = [v.purpose, v.governingLaw, v.jurisdiction, ...Object.values(v.party1), ...Object.values(v.party2)];
  return (
    text.every((t) => t?.trim()) &&
    formatDate(v.effectiveDate) !== "" &&
    (v.mndaExpires === false || (v.mndaExpires === true && v.mndaTermYears !== null)) &&
    (v.confidentialityPerpetual === true || (v.confidentialityPerpetual === false && v.confidentialityYears !== null))
  );
}

// The standard terms mark cover page references with <span> tags; keep the text.
export function stripSpans(markdown: string): string {
  return markdown.replace(/<\/?span[^>]*>/g, "");
}

export function buildNda(values: NdaValues, standardTerms: string): string {
  return `${buildCoverPage(values)}\n\n${stripSpans(standardTerms)}`;
}
