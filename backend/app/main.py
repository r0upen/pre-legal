"""FastAPI app: the /api routes plus the static frontend build."""

import logging
import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import AfterValidator, BaseModel, Field, StringConstraints, model_validator

from app import db
from app.chat import ChatMessage, ChatTurn, ChooseTurn, chat_turn, choose_turn
from app.documents import CATALOG, DocumentId, fields_model, standard_terms

logger = logging.getLogger(__name__)

# The Docker image mirrors the repo layout, so this path works in both places.
STATIC_DIR = Path(__file__).resolve().parents[2] / "frontend" / "out"


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


def ends_with_user(messages: list[ChatMessage]) -> list[ChatMessage]:
    if messages[-1].role != "user":
        raise ValueError("the last message must be from the user")
    return messages


Messages = Annotated[list[ChatMessage], Field(min_length=1, max_length=200), AfterValidator(ends_with_user)]


class ChooseRequest(BaseModel):
    messages: Messages


class ChatRequest(BaseModel):
    document: DocumentId
    messages: Messages
    fields: dict  # checked against the document's own fields below
    today: date  # the user's local date, for relative dates like "next Monday"

    @model_validator(mode="after")
    def fields_match_document(self):
        self.fields = fields_model(self.document).model_validate(self.fields)
        return self


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/documents")
def documents() -> list[dict]:
    """Every agreement Pre-Legal can draft, with its cover page fields (templates/catalog.json)."""
    return CATALOG


@app.get("/api/templates/{doc_id}")
def template(doc_id: DocumentId) -> PlainTextResponse:
    """A document's standard terms as Markdown."""
    return PlainTextResponse(standard_terms(doc_id), media_type="text/markdown")


@app.post("/api/login")
def login(body: LoginRequest, request: Request) -> User:
    """Placeholder sign-in: no password, the email identifies the user."""
    return User(**db.login(request.app.state.db_path, body.name, body.email))


def _assistant_unavailable(exc: Exception) -> HTTPException:
    # Only the exception type: provider errors can echo request details.
    logger.error("chat failed: %s", type(exc).__name__)
    return HTTPException(502, "The assistant is unavailable. Try again.")


@app.post("/api/choose")
def choose(body: ChooseRequest) -> ChooseTurn:
    """One turn of choosing a document: the assistant's reply plus the document it recommends."""
    try:
        return choose_turn(body.messages)
    except Exception as exc:
        raise _assistant_unavailable(exc)


@app.post("/api/chat")
def chat(body: ChatRequest) -> ChatTurn:
    """One turn of a document interview: the assistant's reply plus the merged fields."""
    try:
        return chat_turn(body.document, body.messages, body.fields, body.today)
    except Exception as exc:
        raise _assistant_unavailable(exc)


# Mounted last so the /api routes above take precedence. Skipped until `npm run build` has run.
if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
