// Builds the Mutual NDA as Markdown: a cover page generated from the values the chat
// has collected, followed by the Common Paper standard terms from templates/mutual-nda.md.
// The shape matches NdaFields in backend/app/fields.py; null means "not collected yet".

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

export const emptyParty: Party = { name: null, title: null, company: null, noticeAddress: null };

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
export function orPlaceholder(value: string | null, label: string): string {
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

// The signature table at the end of a cover page, one column per party.
export function partyTable(roles: [string, string], p1: Party, p2: Party): string {
  const row = (label: string, key: keyof Party) =>
    `| ${label} | ${cell(orPlaceholder(p1[key], `${roles[0]} ${label}`))} | ${cell(orPlaceholder(p2[key], `${roles[1]} ${label}`))} |`;
  return [
    `| | ${roles[0].toUpperCase()} | ${roles[1].toUpperCase()} |`,
    "|:--- | :---- | :---- |",
    "| Signature | | |",
    row("Print Name", "name"),
    row("Title", "title"),
    row("Company", "company"),
    row("Notice Address", "noticeAddress"),
    "| Date | | |",
  ].join("\n");
}

export function buildCoverPage(v: NdaValues): string {
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
    partyTable(["Party 1", "Party 2"], v.party1, v.party2),
  ].join("\n\n");
}

export function partyComplete(p: Party): boolean {
  return Object.values(p).every((t) => t?.trim());
}

// True once every required detail is collected; modifications are optional.
export function isComplete(v: NdaValues): boolean {
  return (
    [v.purpose, v.governingLaw, v.jurisdiction].every((t) => t?.trim()) &&
    partyComplete(v.party1) &&
    partyComplete(v.party2) &&
    formatDate(v.effectiveDate) !== "" &&
    (v.mndaExpires === false || (v.mndaExpires === true && v.mndaTermYears !== null)) &&
    (v.confidentialityPerpetual === true || (v.confidentialityPerpetual === false && v.confidentialityYears !== null))
  );
}

export function partyRows(role: string, p: Party): [string, string][] {
  return [
    [`${role} company`, p.company ?? ""],
    [`${role} signer`, [p.name, p.title].filter(Boolean).join(", ")],
    [`${role} notice address`, p.noticeAddress ?? ""],
  ];
}

// The details the user confirms before downloading, as [label, value] rows.
// Only shown once isComplete(v), so it needs no placeholders for missing values.
export function summarize(v: NdaValues): [string, string][] {
  return [
    ...partyRows("Party 1", v.party1),
    ...partyRows("Party 2", v.party2),
    ["Purpose", v.purpose ?? ""],
    ["Effective date", formatDate(v.effectiveDate)],
    ["MNDA term", v.mndaExpires ? `Expires ${years(v.mndaTermYears)} from the Effective Date` : "Continues until terminated"],
    ["Term of confidentiality", v.confidentialityPerpetual ? "In perpetuity" : years(v.confidentialityYears)],
    ["Governing law", v.governingLaw ?? ""],
    ["Jurisdiction", v.jurisdiction ?? ""],
    ["Modifications", v.modifications?.trim() || "None"],
  ];
}

// The standard terms mark cover page references with <span> tags; keep the text.
export function stripSpans(markdown: string): string {
  return markdown.replace(/<\/?span[^>]*>/g, "");
}

export function buildNda(values: NdaValues, standardTerms: string): string {
  return `${buildCoverPage(values)}\n\n${stripSpans(standardTerms)}`;
}
