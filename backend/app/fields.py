"""Field types for the documents the chat fills in, and the Mutual NDA's own fields."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, BeforeValidator


# The model's output is not trusted: values that are blank or invalid become None,
# which the merge in chat.py treats as "not given".
def _text(value):
    return (value.strip() or None) if isinstance(value, str) else None


def _iso_date(value):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        return None


def _years(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 10 else None


Text = Annotated[str | None, BeforeValidator(_text)]
IsoDate = Annotated[str | None, BeforeValidator(_iso_date)]
Years = Annotated[int | None, BeforeValidator(_years)]


# Field names are camelCase to match the frontend (lib/nda.ts, lib/documents.ts).
class Party(BaseModel):
    name: Text
    title: Text
    company: Text
    noticeAddress: Text


class NdaFields(BaseModel):
    purpose: Text
    effectiveDate: IsoDate
    mndaExpires: bool | None
    mndaTermYears: Years
    confidentialityPerpetual: bool | None
    confidentialityYears: Years
    governingLaw: Text
    jurisdiction: Text
    modifications: Text
    party1: Party
    party2: Party
