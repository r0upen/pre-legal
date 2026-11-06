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
  overwrite collected ones). Fields start empty (PL-12 decides when everything is collected;
  modifications are optional). Chat history lives in browser memory only. The standard terms come from
  `/api/templates/mutual-nda` at runtime. `start.sh` passes `.env` with
  `--env-file`, so its lines must be `KEY=value` with no spaces or quotes.
- PL-8: the system prompt asks for full signer names and complete notice
  addresses, asks whether a party is a company or an individual (an
  individual's name also goes in Company, title "Individual") and confirms
  corrections. `Summary.tsx` shows a summary built by `summarize()`
  in `lib/nda.ts`, not by the AI; Download PDF needs its Confirm details click,
  and any field change from the chat clears it (timing: PL-12).
- PL-9: every LLM call passes `max_tokens=MAX_TOKENS` (2000, in `chat.py`);
  the cerebras skill requires it. Measured turns use up to about 1,100
  tokens, hidden reasoning included. A reply cut off at the cap fails
  validation and shows the usual "could not respond" error.
- PL-10: the model returns `ModelTurn` (now also `followUp`, see PL-12);
  `question` must be non-empty while details are missing (else 502), and
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
- PL-13: each sidebar item (`DraftItem.tsx`) has a menu with Rename (inline
  input) and Delete (`ConfirmDialog.tsx`, a native `<dialog>`; jsdom lacks
  `showModal`, so `vitest.setup.ts` stubs it). `drafts.title` is NULL until
  renamed and shows instead of the agreement's name in the sidebar only. `PATCH`
  leaves `updated_at` alone, and autosave never writes `title`. Rename and delete
  run in the save queue (`inTurn` in `lib/api.ts`), so a running save cannot fail
  or re-list a deleted draft. Deleting the open draft shows a fresh chat first.
- PL-12: the app ends the interview. `stages.py` holds the stage (`collecting`,
  `changes`, `review`, `confirmed`) and the fixed final questions; the `stage`
  column replaced `drafts.confirmed`, and the browser sends it with each chat
  turn and reads it back. `is_complete` in `documents.py` is the only
  completeness rule (`isComplete` in TypeScript is gone). Once complete, the
  model's `question` is ignored unless it sets `followUp`, which the prompts
  limit to questions about the user's last message; while details are missing an
  empty question still fails the turn (PL-10). The summary shows only from
  `review`. SLA, DPA, BAA and AI Addendum gained a routine `modifications`; the
  prompt lists every other routine term but not that one, so the model does not
  ask it. Rules for ambiguous places, full official names and one double-check
  are in both prompts; the place rule names Washington and Portland on purpose,
  an exception to PL-10's rule (wording without them still missed some, and they
  did not appear in unrelated replies). `/api/choose` no longer suggests a poor fit. Live runs:
  conditional "(Only if ...)" terms were skipped in about 1 of 18 runs, and the
  model sometimes asks about other routine terms as well.

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