"""The document catalog: each agreement's cover page fields, and the field model the chat uses."""

import json
from functools import cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, create_model

from app.fields import IsoDate, NdaFields, Party, Text

# The Docker image mirrors the repo layout, so this path works in both places.
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "templates"
NDA = "mutual-nda"

CATALOG: list[dict] = json.loads((TEMPLATES_DIR / "catalog.json").read_text())
DOCUMENTS: dict[str, dict] = {entry["id"]: entry for entry in CATALOG}
DocumentId = Literal[tuple(DOCUMENTS)]


def standard_terms(doc_id: str) -> str:
    """The standard terms are the last file listed (the NDA's cover page file comes first)."""
    return (TEMPLATES_DIR / DOCUMENTS[doc_id]["files"][-1]).read_text()


def spec_fields(doc_id: str, routine: bool) -> list[dict]:
    """The cover page fields that are routine terms (with a default) or that the chat asks about."""
    return [f for f in DOCUMENTS[doc_id]["coverPage"]["fields"] if ("default" in f) == routine]


def _model(name: str, fields: list[dict], **extra) -> type[BaseModel]:
    # Every field is required but nullable (null = not given), as strict structured outputs expect.
    return create_model(name, **{f["key"]: (IsoDate if f.get("type") == "date" else Text) for f in fields}, **extra)


@cache
def fields_model(doc_id: str) -> type[BaseModel]:
    """Every field of a document, as the browser sends and receives them. The NDA keeps its own
    model; the others are built from their cover page spec."""
    if doc_id == NDA:
        return NdaFields
    return _model("Fields", DOCUMENTS[doc_id]["coverPage"]["fields"], party1=Party, party2=Party)


@cache
def asked_model(doc_id: str) -> type[BaseModel]:
    """The fields the model fills in during the interview: the parties and the asked terms."""
    if doc_id == NDA:
        return NdaFields
    return _model("Fields", spec_fields(doc_id, routine=False), party1=Party, party2=Party)


@cache
def routine_model(doc_id: str) -> type[BaseModel] | None:
    """Routine terms the model changes only on request. Kept apart from asked_model because a model
    asked for every field re-copies the long default wording each turn, and alters it."""
    routine = [] if doc_id == NDA else spec_fields(doc_id, routine=True)
    return _model("ChangedTerms", routine) if routine else None
