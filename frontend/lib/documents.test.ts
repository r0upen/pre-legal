import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { documentKind, type DocValues, type DocumentSpec } from "./documents";
import { emptyValues } from "./nda";

const TEMPLATES = path.join(__dirname, "..", "..", "templates");
const documents: DocumentSpec[] = JSON.parse(readFileSync(path.join(TEMPLATES, "catalog.json"), "utf-8"));
const spec = (id: string) => documents.find((d) => d.id === id)!;
const terms = (id: string) => readFileSync(path.join(TEMPLATES, spec(id).files.at(-1)!), "utf-8");

const baa = documentKind(spec("business-associate-agreement"));
const filledBaa: DocValues = {
  ...baa.empty,
  agreement: "Cloud Service Agreement between Acme and Globex dated March 5, 2026",
  baaEffectiveDate: "2026-03-05",
  party1: { name: "Ada Lovelace", title: "CEO", company: "Acme Inc.", noticeAddress: "1 Main St, Dover, DE 19901" },
  party2: { name: "Alan Turing", title: "CTO", company: "Globex LLC", noticeAddress: "2 Side St, Austin, TX 73301" },
};

describe("documentKind", () => {
  it("keeps the Mutual NDA's own cover page and fields", () => {
    const nda = documentKind(spec("mutual-nda"));
    expect(nda.empty).toBe(emptyValues);
    expect(nda.build(nda.empty, terms("mutual-nda"))).toContain("### MNDA Term");
    expect(nda.greeting).toContain("what is the name of the first party?");
  });

  it("starts each agreement with its routine terms at their defaults and the rest empty", () => {
    expect(baa.empty).toMatchObject({
      agreement: null,
      baaEffectiveDate: null,
      breachNotificationPeriod: "within 30 days after discovery",
      limitations: "None",
    });
    expect(baa.greeting).toContain("Business Associate Agreement");
    expect(baa.greeting).toContain("what is the Provider's name?");
  });

  it("builds the cover page, then the standard terms without span tags", () => {
    const md = baa.build(baa.empty, terms("business-associate-agreement"));
    expect(md.indexOf("# Business Associate Agreement\n\n## Cover Page")).toBe(0);
    expect(md).toContain(
      "Standard Terms Version 1.0 (“**Standard Terms**”) identical to those posted at [commonpaper.com/standards/business-associate-agreement/1.0](https://commonpaper.com/standards/business-associate-agreement/1.0)",
    );
    expect(md).toContain("### Agreement\n\n[Agreement]");
    expect(md).toContain("### BAA Effective Date\n\n[BAA Effective Date]");
    expect(md).toContain("### Limitations\n\nNone");
    expect(md).toContain("| | PROVIDER | COMPANY |");
    expect(md).toContain("| Print Name | [Provider Print Name] | [Company Print Name] |");
    expect(md).toContain("\n# Standard Terms\n");
    expect(md).not.toContain("<span");
  });

  it("shows dates in words", () => {
    expect(baa.build(filledBaa, "# Terms")).toContain("### BAA Effective Date\n\nMarch 5, 2026");
  });

  it("is complete only once every party detail and term is filled in, with a valid date", () => {
    expect(baa.isComplete(baa.empty)).toBe(false);
    expect(baa.isComplete(filledBaa)).toBe(true);
    expect(baa.isComplete({ ...filledBaa, baaEffectiveDate: "next Monday" })).toBe(false);
    expect(baa.isComplete({ ...filledBaa, limitations: " " })).toBe(false);
    expect(baa.isComplete({ ...filledBaa, party2: { ...filledBaa.party2, title: null } })).toBe(false);
  });

  it("summarizes every detail and marks the terms still at their defaults", () => {
    const rows = baa.summarize({ ...filledBaa, limitations: "No offshoring" });
    expect(rows).toEqual([
      { label: "Provider company", value: "Acme Inc." },
      { label: "Provider signer", value: "Ada Lovelace, CEO" },
      { label: "Provider notice address", value: "1 Main St, Dover, DE 19901" },
      { label: "Company company", value: "Globex LLC" },
      { label: "Company signer", value: "Alan Turing, CTO" },
      { label: "Company notice address", value: "2 Side St, Austin, TX 73301" },
      { label: "Agreement", value: filledBaa.agreement, isDefault: false },
      { label: "BAA Effective Date", value: "March 5, 2026", isDefault: false },
      { label: "Breach Notification Period", value: "within 30 days after discovery", isDefault: true },
      { label: "Limitations", value: "No offshoring", isDefault: false },
    ]);
  });

  it.each(documents.filter((d) => d.coverPage).map((d) => d.id))("builds %s from its template", (id) => {
    const kind = documentKind(spec(id));
    const md = kind.build(kind.empty, terms(id));
    expect(md.indexOf(`# ${spec(id).name}\n`)).toBe(0);
    for (const f of spec(id).coverPage!.fields) expect(md).toContain(`### ${f.label}`);
    expect(md).not.toContain("<span");
  });
});
