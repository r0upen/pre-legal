# Pre-Legal frontend

Next.js app for drafting a Mutual NDA. After a placeholder sign-in, the user
fills in a form, sees a live preview and downloads the agreement as a PDF
through the browser print dialog.

The app is a static export (`output: "export"`): `npm run build` writes plain
HTML and JS to `out/`, which the FastAPI backend serves. The standard terms are
fetched from the backend (`/api/templates/mutual-nda`). The cover page is
generated from the form values in `lib/nda.ts`.

## Commands

Run from this directory:

- `npm install` - install dependencies
- `npm run dev` - start the dev server at http://localhost:3000; it calls the backend on port 8000 (see the root README)
- `npm test` - run the Vitest unit and component tests
- `npm run lint` - run ESLint
- `npm run build` - build the static files into `out/`
