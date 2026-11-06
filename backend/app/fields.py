"""Field types for the documents the chat fills in, and the Mutual NDA's own fields."""

from datetime import date
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ValidationInfo

from app.checks import YEARS_PROBLEM, address_problem, date_problem, law_problem, percent_problem


# The model's output is not trusted: values that are blank or invalid become None, which the merge
# in chat.py treats as "not given". When chat.py passes a context, what the user should hear about a
# value that failed a check also goes in its "rejected" list. Other callers get just the None.
def _reject(info: ValidationInfo, problem: str) -> None:
    if info.context is not None:
        info.context["rejected"].append(problem)


def _text(value):
    return (value.strip() or None) if isinstance(value, str) else None


def _checked(problem_with):
    """A text field that must also pass a check from checks.py."""

    def validate(value, info: ValidationInfo):
        text = _text(value)
        if text and (problem := problem_with(text)):
            _reject(info, problem)
            return None
        return text

    return validate


def _iso_date(value, info: ValidationInfo):
    try:
        return date.fromisoformat(value).isoformat()
    except (TypeError, ValueError):
        if text := _text(value):
            _reject(info, date_problem(text))
        return None


def _years(value, info: ValidationInfo):
    if isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 10:
        return value
    if value is not None:
        _reject(info, YEARS_PROBLEM)
    return None


Text = Annotated[str | None, BeforeValidator(_text)]
IsoDate = Annotated[str | None, BeforeValidator(_iso_date)]
Years = Annotated[int | None, BeforeValidator(_years)]
Address = Annotated[str | None, BeforeValidator(_checked(address_problem))]
Law = Annotated[str | None, BeforeValidator(_checked(law_problem))]
Percent = Annotated[str | None, BeforeValidator(_checked(percent_problem))]


# Field names are camelCase to match the frontend (lib/nda.ts, lib/documents.ts).
class Party(BaseModel):
    name: Text
    title: Text
    company: Text
    noticeAddress: Address


class NdaFields(BaseModel):
    purpose: Text
    effectiveDate: IsoDate
    mndaExpires: bool | None
    mndaTermYears: Years
    confidentialityPerpetual: bool | None
    confidentialityYears: Years
    governingLaw: Law
    jurisdiction: Text
    modifications: Text
    party1: Party
    party2: Party
