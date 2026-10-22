"""FastAPI app: the /api routes plus the static frontend build."""

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, StringConstraints

from app import db

# The Docker image mirrors the repo layout, so these paths work in both places.
ROOT = Path(__file__).resolve().parents[2]
TEMPLATES_DIR = ROOT / "templates"
STATIC_DIR = ROOT / "frontend" / "out"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Read at startup, not import, so tests can point it at a temporary file.
    app.state.db_path = Path(os.environ.get("PRELEGAL_DB", "/tmp/prelegal.db"))
    db.reset(app.state.db_path)
    yield


app = FastAPI(title="Pre-Legal", lifespan=lifespan)

# Only needed in development, when the Next.js dev server on port 3000 calls the API.
if origins := os.environ.get("CORS_ORIGINS"):
    app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in origins.split(",")], allow_methods=["*"], allow_headers=["*"])

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
]


class LoginRequest(BaseModel):
    name: Name
    email: Email


class User(BaseModel):
    id: int
    name: str
    email: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/templates/mutual-nda")
def mutual_nda_template() -> PlainTextResponse:
    """The Mutual NDA standard terms as Markdown."""
    return PlainTextResponse((TEMPLATES_DIR / "mutual-nda.md").read_text(), media_type="text/markdown")


@app.post("/api/login")
def login(body: LoginRequest, request: Request) -> User:
    """Placeholder sign-in: no password, the email identifies the user."""
    return User(**db.login(request.app.state.db_path, body.name, body.email))


# Mounted last so the /api routes above take precedence. Skipped until `npm run build` has run.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
