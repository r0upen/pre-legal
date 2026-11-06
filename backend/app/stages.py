"""The interview's stages and the app's fixed final questions. The app sets these instead of the
model because the model sometimes combined the last two requests in one message."""

from typing import Literal

from app.documents import NDA

# collecting: details are missing. changes: the changes question was asked. review: the summary
# and Confirm details show. confirmed: the user clicked Confirm details and can download.
Stage = Literal["collecting", "changes", "review", "confirmed"]

CHANGES_QUESTION = "Would you like any changes to the standard terms (most people have none)?"
REVIEW_REQUEST = (
    "A lawyer should review the draft before it is used. Could you check the summary above the "
    "preview and click Confirm details, or let me know what to change?"
)
DEFAULTS_NOTE = "The other terms use Common Paper's usual defaults, marked in the summary."
CONFIRMED_NOTICE = (
    "Your details are confirmed. You can download the PDF, or let me know what to change. "
    "A lawyer should review the draft before it is used."
)


def rejection_text(problems: list[str]) -> str:
    """What the app says when a value failed a code check. The app says it, not the model, whose reply
    may already claim the value was recorded."""
    return f"Sorry, I couldn't use that. {' '.join(dict.fromkeys(problems))} Could you send it again?"


def next_stage(stage: Stage, complete: bool, changed: bool, follow_up: bool) -> Stage:
    """The stage after one turn. A follow-up means the model still needs an answer, so the stage waits."""
    if not complete:
        return "collecting"
    if stage == "confirmed" and changed:
        stage = "review"
    if follow_up:
        return stage
    return {"collecting": "changes", "changes": "review"}.get(stage, stage)


def fixed_question(doc_id: str, stage: Stage) -> str:
    """What the app asks at the end of the interview. Only the NDA has no routine terms."""
    if stage == "changes":
        return CHANGES_QUESTION
    if stage == "confirmed":
        return CONFIRMED_NOTICE
    return REVIEW_REQUEST if doc_id == NDA else f"{DEFAULTS_NOTE} {REVIEW_REQUEST}"
