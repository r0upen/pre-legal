# pre-legal
An AI-assisted platform for drafting common legal agreements from templates

- `frontend/`: Next.js app, built as static files (see `frontend/README.md`)
- `backend/`: FastAPI app, managed with uv. Serves the `/api` routes and the built frontend.
- `templates/`: agreement templates
- `scripts/`: start and stop the app on a Mac

## Run the app

Requires Docker Desktop, running.

- `scripts/start.sh` - build and start the app in one container at http://localhost:8000
- `scripts/stop.sh` - stop it

The database is SQLite and is recreated empty every time the app starts, so
accounts and saved drafts last only until the next restart.

Not ready for real users yet: see [known limitations](docs/how-it-works.md#known-limitations-before-real-users)
(two tabs on one draft, secure cookie over HTTPS, login rate limiting, password reset).

## Develop

Run the backend and the frontend dev server in two terminals:

- `cd backend && CORS_ORIGINS=http://localhost:3000 uv run uvicorn app.main:app --reload`
- `cd frontend && npm run dev`, then open http://localhost:3000

Tests: `cd backend && uv run pytest` and `cd frontend && npm test`.

Legal agreement templates in `templates/` are from Common Paper under CC BY 4.0. See `templates/LICENSE.md`.
