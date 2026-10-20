# Pre-Legal

## Overview
Pre-Legal is a web app that helps people draft common legal agreements
(NDAs, service agreements and similar) through a chat with an AI. The AI
asks questions, fills in a template and lets the user download the draft.
Drafts come from Markdown templates in `templates/`, listed in
`catalog.json`. Drafts are a starting point for review by a lawyer, not
legal advice, and the app must say so.

## Current status
Nothing built yet. The repo, the Atlassian and GitHub MCP servers and the
feature-dev plugin are set up. Update this section after every ticket.

## Development process
- Read the ticket with the Atlassian tools before starting.
- Ask clarifying questions when requirements are unclear. Don't skip
  feature-dev phases.
- Add unit and integration tests for new behavior and make sure all tests pass.
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