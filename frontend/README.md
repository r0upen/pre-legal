# Pre-Legal frontend

Next.js app for drafting the Common Paper agreements by chatting with an AI.
After signing up or logging in, the user chooses an agreement, answers the
assistant's questions while a live preview fills in, confirms a summary and
downloads the agreement as a PDF through the browser print dialog. Drafts save
themselves and can be reopened from a sidebar.

The app is a static export (`output: "export"`): `npm run build` writes plain
HTML and JS to `out/`, which the FastAPI backend serves. The list of agreements
(`/api/documents`) and their standard terms (`/api/templates/{id}`) come from
the backend. Cover pages are generated from the collected values: the Mutual
NDA's in `lib/nda.ts`, the others in `lib/documents.ts` from their spec in
`templates/catalog.json`.

## Commands

Run from this directory:

- `npm install` - install dependencies
- `npm run dev` - start the dev server at http://localhost:3000; it calls the backend on port 8000 (see the root README)
- `npm test` - run the Vitest unit and component tests
- `npm run lint` - run ESLint
- `npm run build` - build the static files into `out/`
