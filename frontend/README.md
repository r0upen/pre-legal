# Pre-Legal frontend

Next.js app for drafting a Mutual NDA. The user fills in a form, sees a live
preview and downloads the agreement as a PDF through the browser print dialog.
There is no backend yet.

The standard terms are read from `../templates/mutual-nda.md` at build time.
The cover page is generated from the form values in `lib/nda.ts`.

## Commands

Run from this directory:

- `npm install` - install dependencies
- `npm run dev` - start the dev server at http://localhost:3000
- `npm test` - run the Vitest unit and component tests
- `npm run lint` - run ESLint
- `npm run build` - production build
