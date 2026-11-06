"""The chat: one structured LLM call per turn (LiteLLM, OpenRouter, Cerebras), either to choose
a document or to interview the user for the chosen document's fields."""

from datetime import date
from functools import cache
from pathlib import Path
from typing import Annotated, Literal

from dotenv import load_dotenv
from litellm import completion
from pydantic import BaseModel, StringConstraints, create_model

from app.documents import DocumentId, asked_model, fields_model, is_complete, routine_model
from app.prompts import choose_prompt, interview_prompt
from app.stages import Stage, fixed_question, next_stage, rejection_text

# Loads OPENROUTER_API_KEY from the project-root .env in development. In Docker the
# file is absent and the key comes from `docker run --env-file`.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
# Without a cap OpenRouter reserves credit for ~41,000 tokens per call. The longest
# measured turn (hidden reasoning included) used about 1,100.
MAX_TOKENS = 2000

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChatTurn(BaseModel):
    reply: str
    fields: dict
    stage: Stage


class ChooseTurn(BaseModel):
    reply: NonEmpty
    recommendation: DocumentId | None  # shown as a Start button; the user's click starts it


@cache
def model_turn(doc_id: str) -> type[BaseModel]:
    """What the model returns for one document. Fields come first so the model records the answer
    before choosing the question. reply is only the acknowledgement: chat_turn joins it with the
    question, which is the app's fixed text once every detail is collected, unless followUp says
    the model still needs an answer. Documents with routine terms also get changedTerms, for the
    ones the user asks to change."""
    changed = {"changedTerms": routine} if (routine := routine_model(doc_id)) else {}
    return create_model("ModelTurn", fields=asked_model(doc_id), **changed, reply=str, followUp=bool, question=str)


def _ask(system: str, messages: list[ChatMessage], response_format: type[BaseModel], context: dict | None = None) -> BaseModel:
    response = completion(
        model=MODEL,
        messages=[{"role": "system", "content": system}, *(m.model_dump() for m in messages)],
        response_format=response_format,
        extra_body=EXTRA_BODY,
        max_tokens=MAX_TOKENS,
        timeout=30,
    )
    return response_format.model_validate_json(response.choices[0].message.content, context=context)


def _merge(old: dict, new: dict) -> dict:
    return {k: _merge(old[k], v) if isinstance(v, dict) else (old[k] if v is None else v) for k, v in new.items()}


def merge(old: BaseModel, new: BaseModel) -> BaseModel:
    """Keeps each collected value unless the model gave a new one, so null never clears a field."""
    return type(old).model_validate(_merge(old.model_dump(), new.model_dump()))


def chat_turn(doc_id: str, messages: list[ChatMessage], fields: BaseModel, today: date, stage: Stage) -> ChatTurn:
    """Sends the interview to the model and returns its reply with the merged fields and the new stage."""
    asked = asked_model(doc_id).model_validate(fields.model_dump())
    routine = routine_model(doc_id)
    system = interview_prompt(doc_id).format(
        today=f"{today.isoformat()} ({today:%A})",
        fields=asked.model_dump_json(),
        routine=routine.model_validate(fields.model_dump()).model_dump_json() if routine else "{}",
    )
    rejected: list[str] = []  # filled by the checks in fields.py as the model's output is parsed
    turn = _ask(system, messages, model_turn(doc_id), {"rejected": rejected})
    given = turn.fields.model_dump() | (turn.changedTerms.model_dump() if routine else {})
    # Fields the model was not asked for count as not given, so the merge keeps them.
    given = fields_model(doc_id).model_validate(dict.fromkeys(type(fields).model_fields) | given)
    merged = merge(fields, given)
    complete = is_complete(doc_id, merged)
    # A rejected value still needs an answer, so the stage waits like it does for a follow-up.
    new_stage = next_stage(stage, complete, merged != fields, turn.followUp or bool(rejected))
    if rejected:
        text = rejection_text(rejected)
    else:
        # Unless the model needs an answer, its question is ignored once every detail is collected.
        question = fixed_question(doc_id, new_stage) if complete and not turn.followUp else turn.question.strip()
        if not question:
            raise ValueError("the model asked no question")
        text = " ".join(part for part in (turn.reply.strip(), question) if part)
    # The reply goes back in the history, so it must pass the same checks as any message.
    reply = ChatMessage(role="assistant", content=text).content
    return ChatTurn(reply=reply, fields=merged.model_dump(), stage=new_stage)


def choose_turn(messages: list[ChatMessage]) -> ChooseTurn:
    """Asks the model which document fits the user's description."""
    turn = _ask(choose_prompt(), messages, ChooseTurn)
    ChatMessage(role="assistant", content=turn.reply)  # same check as above
    return turn
