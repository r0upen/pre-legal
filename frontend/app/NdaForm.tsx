"use client";

import type { NdaValues, Party } from "@/lib/nda";

type Props = {
  values: NdaValues;
  onChange: (values: NdaValues) => void;
};

const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => i + 1);

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function NdaForm({ values, onChange }: Props) {
  const set = <K extends keyof NdaValues>(key: K, value: NdaValues[K]) =>
    onChange({ ...values, [key]: value });

  const setParty = (key: "party1" | "party2", field: keyof Party, value: string) =>
    set(key, { ...values[key], [field]: value });

  const text = (key: "purpose" | "governingLaw" | "jurisdiction" | "modifications") => ({
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
  });

  // A dropdown rather than a number input, so the value is always a valid number of years.
  const yearsInput = (key: "mndaTermYears" | "confidentialityYears", disabled: boolean, label: string) => (
    <select
      aria-label={label}
      disabled={disabled}
      value={values[key]}
      onChange={(e) => set(key, Number(e.target.value))}
      className="mx-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm disabled:bg-slate-100"
    >
      {YEAR_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );

  return (
    <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
      {(["party1", "party2"] as const).map((key, i) => (
        <Section key={key} title={`Party ${i + 1}`}>
          <Field label="Company">
            <input className={inputClass} value={values[key].company} onChange={(e) => setParty(key, "company", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signer name">
              <input className={inputClass} value={values[key].name} onChange={(e) => setParty(key, "name", e.target.value)} />
            </Field>
            <Field label="Signer title">
              <input className={inputClass} value={values[key].title} onChange={(e) => setParty(key, "title", e.target.value)} />
            </Field>
          </div>
          <Field label="Notice address (email or postal)">
            <input
              className={inputClass}
              value={values[key].noticeAddress}
              onChange={(e) => setParty(key, "noticeAddress", e.target.value)}
            />
          </Field>
        </Section>
      ))}

      <Section title="Agreement">
        <Field label="Purpose">
          <textarea rows={3} className={inputClass} {...text("purpose")} />
        </Field>
        <Field label="Effective date">
          <input
            type="date"
            className={inputClass}
            value={values.effectiveDate}
            onChange={(e) => set("effectiveDate", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="MNDA term">
        <label className="flex items-center text-sm">
          <input type="radio" checked={values.mndaExpires} onChange={() => set("mndaExpires", true)} />
          <span className="ml-2">Expires after</span>
          {yearsInput("mndaTermYears", !values.mndaExpires, "MNDA term in years")}
          <span>year(s)</span>
        </label>
        <label className="flex items-center text-sm">
          <input type="radio" checked={!values.mndaExpires} onChange={() => set("mndaExpires", false)} />
          <span className="ml-2">Continues until terminated</span>
        </label>
      </Section>

      <Section title="Term of confidentiality">
        <label className="flex items-center text-sm">
          <input
            type="radio"
            checked={!values.confidentialityPerpetual}
            onChange={() => set("confidentialityPerpetual", false)}
          />
          {yearsInput("confidentialityYears", values.confidentialityPerpetual, "Confidentiality term in years")}
          <span>year(s) from the effective date</span>
        </label>
        <label className="flex items-center text-sm">
          <input
            type="radio"
            checked={values.confidentialityPerpetual}
            onChange={() => set("confidentialityPerpetual", true)}
          />
          <span className="ml-2">In perpetuity</span>
        </label>
      </Section>

      <Section title="Governing law and jurisdiction">
        <Field label="Governing law (state)">
          <input className={inputClass} placeholder="Delaware" {...text("governingLaw")} />
        </Field>
        <Field label="Jurisdiction">
          <input className={inputClass} placeholder="courts located in New Castle, DE" {...text("jurisdiction")} />
        </Field>
      </Section>

      <Section title="Modifications">
        <Field label="Changes to the standard terms (optional)">
          <textarea rows={3} className={inputClass} {...text("modifications")} />
        </Field>
      </Section>
    </form>
  );
}
