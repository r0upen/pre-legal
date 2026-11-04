# Pre-Legal

## Overview
Pre-Legal is a web app that helps people draft common legal agreements
(NDAs, service agreements and similar) through a chat with an AI. The AI
asks questions, fills in a template and lets the user download the draft.
Drafts come from Markdown templates in `templates/`, listed in
`catalog.json`. Drafts are a starting point for review by a lawyer, not
legal advice, and the app must say so.

## Current status
The repo, the Atlassian and GitHub MCP servers and the feature-dev plugin
are set up. Update this section after every ticket.
- PL-1: 11 Common Paper agreements (CC BY 4.0) copied unchanged into
  `templates/`, described in `templates/catalog.json`, credited in
  `templates/LICENSE.md`. Variables are marked inline with
  `<span class="...">`. Only the Mutual NDA ships a cover page; the
  others are standard terms only. `backend/` is a bare uv project with
  pytest checks that the catalog matches the files.
- PL-2: `frontend/` is a Next.js 16 prototype (no backend) for a Mutual
  NDA: form, live Markdown preview, PDF download via the print dialog.
  `lib/nda.ts` builds the cover page from form values and appends
  `templates/mutual-nda.md`, read at build time. Tests use Vitest and
  Testing Library (`npm test`).
- PL-3: one Docker container. The frontend is a Next.js static export
  (`cacheComponents` removed, since it cannot be used with export);
  FastAPI (`backend/app/main.py`) serves it plus `/api/health`,
  `/api/templates/mutual-nda` and `/api/login`. SQLite via stdlib
  `sqlite3` (`backend/app/db.py`), recreated on every start. Placeholder
  sign-in at first (PL-6 replaced it with real accounts). `scripts/start.sh` and `scripts/stop.sh` run it at
  http://localhost:8000.
- PL-7: in the PDF the standard terms no longer start on a new page; they
  follow the parties table, which is kept on one page together with the
  signing sentence above it (`globals.css`).
- PL-4: an AI chat (`NdaChat.tsx`) replaces the NDA form. `POST /api/chat`
  (`backend/app/chat.py`, LiteLLM per the cerebras skill) is stateless: the
  browser sends the history, the current fields and its local date, and gets
  back the reply plus the merged fields (null or invalid values never
  overwrite collected ones). Fields start empty; `isComplete()` in
  `lib/nda.ts` tells when everything is collected (modifications are
  optional). Chat history lives in browser memory only. The standard terms come from
  `/api/templates/mutual-nda` at runtime. `start.sh` passes `.env` with
  `--env-file`, so its lines must be `KEY=value` with no spaces or quotes.
- PL-8: the system prompt asks for full signer names and complete notice
  addresses, asks whether a party is a company or an individual (an
  individual's name also goes in Company, title "Individual") and confirms
  corrections. Once `isComplete()`, `NdaSummary.tsx` shows a summary built
  by `summarize()` in `lib/nda.ts`, not by the AI; Download PDF needs its
  Confirm details click, and any field change from the chat clears it.
- PL-9: every LLM call passes `max_tokens=MAX_TOKENS` (2000, in `chat.py`);
  the cerebras skill requires it. Measured turns use up to about 1,100
  tokens, hidden reasoning included. A reply cut off at the cap fails
  validation and shows the usual "could not respond" error.
- PL-10: the model returns `ModelTurn` (`fields`, `reply`, `question`);
  `question` must be non-empty (else 502) so every turn asks one, and
  `chat_turn` joins reply and question into the `ChatTurn.reply` the
  browser gets. The prompt
  lists the questions in order, one detail each, says which Party field is
  the party's name (`company`) and which the signer's (`name`), double-checks
  clearly odd values once, bans internal names in replies, and sets a warmer
  tone; so does the greeting in `NdaBuilder.tsx`. Keep prompt examples free
  of concrete names and dates: the model copies them into replies.
- PL-11: chat restyled as a messaging app (bubbles, growing textarea where
  Enter sends and Shift+Enter adds a line, icon Send button, typing dots).
  While waiting the box is `readOnly`, never `disabled`: browsers move focus
  off a disabled field, so the cursor would be lost after every answer.
  On `lg` screens `main` is `h-dvh` with `flex-none` (a flex item otherwise
  grows to its content) and the grid uses `grid-rows-1` plus `min-h-0`, so
  the chat and the document each scroll inside; print styles undo the
  height limit. jsdom has no layout, so check layout in a real browser.
- PL-5: all 11 agreements. The chat opens on a document choice (suggestion
  buttons, See all, or a description sent to `POST /api/choose`, whose
  `recommendation` becomes a Start button; only the click starts it).
  Every catalog entry except the Mutual NDA has a `coverPage` spec: parties
  plus ordered fields (`key`, `label`, `ask`, optional `type: date` and
  `default`). Fields with a `default` are routine terms: pre-filled, not
  asked, marked Default in the summary while unchanged. One generic engine
  (`documents.py`, `prompts.py`, `lib/documents.ts`) builds the model,
  prompt, cover page and summary from the spec; the NDA keeps its own,
  plugged into the same `documentKind` interface. The model never sees
  routine terms in `fields`, only a separate `changedTerms` part: when it
  had to echo every field it re-copied the long default wording and
  altered it. `/api/chat` takes a `document` id and checks `fields`
  against that document's model.
- PL-6: real accounts replace the PL-3 placeholder sign-in. `auth.py`:
  passwords hashed with stdlib `scrypt`; a random session token in an
  HttpOnly, SameSite=Lax cookie, only its hash stored (`sessions` table, 7
  days). `current_user` guards `/api/chat`, `/api/choose` and `/api/drafts`;
  any 401 returns the browser to the log in screen. `drafts.py`: the browser
  autosaves the full draft (`PUT /api/drafts/{id}`) after each reply and
  confirm, so `/api/chat` stays stateless; `lib/api.ts` runs saves one at a
  time and `getDraft` waits for them; a draft is created when a document
  starts, and every query filters on `user_id`. `Workspace.tsx` holds the
  sidebar (`Sidebar.tsx`) and the builder, remounted through `key` for each
  draft or New document; Change document is gone. A reply arriving after
  leaving a draft is dropped, not saved. The notice is one footer in `App.tsx`;
  the PDF's copy sits above the agreement's title. The sidebar is a drawer
  below `xl`. Known limitations before real users are in `docs/how-it-works.md`.

## Development process
- Read the ticket with the Atlassian tools before starting.
- Ask clarifying questions when requirements are unclear. Don't skip
  feature-dev phases.
- Use feature-dev for feature tickets. One-off data or setup tasks don't need it.
- Add unit and integration tests for new behavior and make sure all tests pass.
- After each ticket, update `docs/how-it-works.md` in plain English (no code)
  to reflect what changed, as part of the ticket's PR.
- Open a PR with the GitHub tools when done. Never push directly to main
  unless I ask.
- Requirements live in Jira tickets, not in this file.

## AI design
- Use the cerebras skill whenever writing code that calls an LLM.
- Use structured outputs so the model returns both its reply and the
  document field values.
- The OpenRouter API key is `OPENROUTER_API_KEY` in `.env` at the project
  root. Never print or log it.

## Technical design
- Everything runs in a single Docker container.
- `backend/`: Python with FastAPI, managed with uv.
- `frontend/`: Next.js.
- Database: SQLite, recreated from scratch each time the container starts.
- `scripts/`: start and stop scripts for Mac.

## Style
- Clean, professional SaaS look with a light background.
- Primary color: navy (#1F3A5F). Accent: teal (#2A9D8F).