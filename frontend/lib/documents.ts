// Every agreement the app can draft, as described by templates/catalog.json (served by
// /api/documents). The Mutual NDA keeps its own cover page (lib/nda.ts); the others are
// built here from their cover page spec: the two parties and the terms, in interview order.
import {
  buildNda,
  emptyParty,
  emptyValues as emptyNda,
  formatDate,
  orPlaceholder,
  partyRows,
  partyTable,
  stripSpans,
  summarize as ndaSummary,
  type NdaValues,
  type Party,
} from "./nda";

// Routine terms carry a default (Common Paper's usual choice): they start filled in and the AI
// does not ask about them one by one. The others are asked, in the order listed.
export type FieldSpec = {
  key: string;
  label: string;
  ask: string;
  type?: "text" | "date" | "law" | "percent";
  default?: string;
};

export type DocumentSpec = {
  id: string;
  name: string;
  description: string;
  version: string;
  files: string[];
  coverPage?: { parties: [string, string]; fields: FieldSpec[] };
};

// The fields the chat fills in: NdaValues for the NDA, or one value per cover page field.
// Matches the document's fields model in backend/app/documents.py; null means "not collected yet".
export type DocValues = { party1: Party; party2: Party } & Record<string, unknown>;

// One row of the summary the user confirms; isDefault marks a routine term left at its default.
export type SummaryRow = { label: string; value: string; isDefault?: boolean };

// What the app needs to know about one document, whichever way its cover page is built.
export type DocumentKind = {
  empty: DocValues;
  greeting: string;
  build: (values: DocValues, standardTerms: string) => string;
  summarize: (values: DocValues) => SummaryRow[];
};

const NDA = "mutual-nda";

// How a field reads on the cover page and in the summary. Dates are stored as YYYY-MM-DD and
// shown in words; formatDate gives "" for anything invalid.
function shown(v: DocValues, f: FieldSpec): string {
  const value = (v[f.key] as string | null) ?? null;
  return f.type === "date" ? formatDate(value) : (value?.trim() ?? "");
}

const toRows = (pairs: [string, string][]): SummaryRow[] => pairs.map(([label, value]) => ({ label, value }));

function greeting(name: string, firstQuestion: string): string {
  return `Great, let's draft your ${name}. I'll ask one thing at a time, and the draft fills in as we go. To start, ${firstQuestion}`;
}

export function documentKind(spec: DocumentSpec): DocumentKind {
  if (spec.id === NDA || !spec.coverPage) {
    return {
      empty: emptyNda,
      greeting: greeting("Mutual NDA", "what is the name of the first party?"),
      build: (v, terms) => buildNda(v as NdaValues, terms),
      summarize: (v) => toRows(ndaSummary(v as NdaValues)),
    };
  }
  const { parties, fields } = spec.coverPage;
  return {
    empty: { ...Object.fromEntries(fields.map((f) => [f.key, f.default ?? null])), party1: emptyParty, party2: emptyParty },
    greeting: greeting(spec.name, `what is the ${parties[0]}'s name?`),
    // The terms open with the agreement's title, which the cover page already shows.
    build: (v, terms) => `${buildCoverPage(spec, v)}\n\n${stripSpans(terms).replace(/^# .*/, "# Standard Terms")}`,
    summarize: (v) => [
      ...toRows([...partyRows(parties[0], v.party1), ...partyRows(parties[1], v.party2)]),
      // A value still equal to its default was not specifically chosen by the user.
      ...fields.map((f) => ({ label: f.label, value: shown(v, f), isDefault: f.default !== undefined && v[f.key] === f.default })),
    ],
  };
}

function buildCoverPage(spec: DocumentSpec, v: DocValues): string {
  const { parties, fields } = spec.coverPage!;
  const url = `https://commonpaper.com/standards/${spec.id}/${spec.version}`;
  return [
    `# ${spec.name}`,
    "## Cover Page",
    `This ${spec.name} consists of: (1) this Cover Page (“**Cover Page**”) and (2) the Common Paper ${spec.name} Standard Terms Version ${spec.version} (“**Standard Terms**”) identical to those posted at [${url.replace("https://", "")}](${url}). Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with the Standard Terms.`,
    ...fields.flatMap((f) => [`### ${f.label}`, orPlaceholder(shown(v, f), f.label)]),
    `By signing this Cover Page, each party agrees to enter into this ${spec.name}.`,
    partyTable(parties, v.party1, v.party2),
  ].join("\n\n");
}
