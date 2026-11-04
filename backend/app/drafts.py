"""Saved drafts. The browser sends a draft's full state after each change; each user sees only their own."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request
from pydantic import BaseModel, Field, ValidationError, model_validator

from app import db
from app.auth import CurrentUser
from app.chat import ChatMessage
from app.documents import DocumentId, fields_model

# Room for a full choosing chat and a full interview (each capped at 200 messages in main.py).
SavedMessages = Annotated[list[ChatMessage], Field(min_length=1, max_length=500)]
# SQLite integers stop at 64 bits; a larger id would raise an error instead of finding nothing.
DraftId = Annotated[int, Path(ge=1, le=2**63 - 1)]


class DraftState(BaseModel):
    messages: SavedMessages
    start: Annotated[int, Field(ge=0)]  # where the interview starts in the messages
    fields: dict  # checked against the document's own fields by _checked_fields

    @model_validator(mode="after")
    def start_within_messages(self):
        if self.start > len(self.messages):
            raise ValueError("start is past the end of the messages")
        return self

    def message_dicts(self) -> list[dict]:
        return [m.model_dump() for m in self.messages]


class NewDraft(DraftState):
    document: DocumentId


class DraftUpdate(DraftState):
    confirmed: bool


class Draft(DraftState):
    id: int
    document: DocumentId
    confirmed: bool
    updatedAt: str


class DraftSummary(BaseModel):
    """One sidebar item."""

    id: int
    document: DocumentId
    parties: list[str]
    updatedAt: str


def _checked_fields(document: str, fields: dict) -> dict:
    try:
        return fields_model(document).model_validate(fields).model_dump()
    except ValidationError:
        raise HTTPException(422, "The fields do not match this document.")


def _summary(draft: dict) -> DraftSummary:
    companies = (draft["fields"][party]["company"] for party in ("party1", "party2"))
    return DraftSummary(
        id=draft["id"],
        document=draft["document"],
        parties=[company for company in companies if company],
        updatedAt=draft["updatedAt"],
    )


router = APIRouter(prefix="/api/drafts")


@router.get("")
def list_drafts(user: CurrentUser, request: Request) -> list[DraftSummary]:
    return [_summary(draft) for draft in db.list_drafts(request.app.state.db_path, user.id)]


@router.post("", status_code=201)
def create_draft(body: NewDraft, user: CurrentUser, request: Request) -> DraftSummary:
    fields = _checked_fields(body.document, body.fields)
    return _summary(
        db.create_draft(request.app.state.db_path, user.id, body.document, body.message_dicts(), body.start, fields)
    )


@router.get("/{draft_id}")
def get_draft(draft_id: DraftId, user: CurrentUser, request: Request) -> Draft:
    draft = db.get_draft(request.app.state.db_path, user.id, draft_id)
    if not draft:
        raise HTTPException(404, "Draft not found.")
    return Draft(**draft)


@router.put("/{draft_id}")
def update_draft(draft_id: DraftId, body: DraftUpdate, user: CurrentUser, request: Request) -> DraftSummary:
    path = request.app.state.db_path
    # A draft's document never changes, so its fields are checked against the stored one.
    current = db.get_draft(path, user.id, draft_id)
    if not current:
        raise HTTPException(404, "Draft not found.")
    fields = _checked_fields(current["document"], body.fields)
    return _summary(db.update_draft(path, user.id, draft_id, body.message_dicts(), body.start, fields, body.confirmed))
