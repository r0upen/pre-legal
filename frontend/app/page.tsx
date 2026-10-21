import { readFileSync } from "node:fs";
import path from "node:path";
import NdaBuilder from "./NdaBuilder";

// Read at build time; templates/ at the repo root is the single source of the NDA text.
const standardTerms = readFileSync(path.join(process.cwd(), "..", "templates", "mutual-nda.md"), "utf-8");

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 print:p-0">
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold text-navy">Mutual NDA Creator</h1>
        <p className="text-sm text-slate-600">
          Fill in the details and the agreement updates as you type. Download it as a PDF when you are done.
        </p>
      </header>
      <NdaBuilder standardTerms={standardTerms} />
    </main>
  );
}
