"""Checks the end of the interview: the one completeness rule, the stages and the app's fixed final
questions, with the LLM mocked. Every document type goes through the same steps."""

import json
from types import SimpleNamespace

import pytest

from app import chat
from app.documents import DOCUMENTS, NDA, fields_model, is_complete, spec_fields
from app.stages import CHANGES_QUESTION, CONFIRMED_NOTICE, DEFAULTS_NOTE, REVIEW_REQUEST, fixed_question, next_stage

PARTY = {"name": "Ada Lovelace", "title": "CEO", "company": "Acme Inc.", "noticeAddress": "1 Main St, Dover, DE 19901"}
DOC_IDS = list(DOCUMENTS)


def complete_fields(doc_id: str) -> dict:
    """Every required detail of a document, filled in."""
    if doc_id == NDA:
        terms = {
            "purpose": "Exploring a deal",
            "effectiveDate": "2027-03-05",
            "mndaExpires": True,
            "mndaTermYears": 1,
            "confidentialityPerpetual": False,
            "confidentialityYears": 2,
            "governingLaw": "the State of Delaware",
            "jurisdiction": "courts located in Dover, Delaware",
            "modifications": None,
        }
    else:
        terms = {f["key"]: "2027-03-05" if f.get("type") == "date" else "Agreed" for f in DOCUMENTS[doc_id]["coverPage"]["fields"]}
    return terms | {"party1": PARTY, "party2": PARTY}


def validated(doc_id: str, **changes):
    return fields_model(doc_id).model_validate(complete_fields(doc_id) | changes)


@pytest.mark.parametrize("doc_id", DOC_IDS)
def test_complete_once_every_required_detail_is_in(doc_id):
    assert is_complete(doc_id, validated(doc_id))
    assert not is_complete(doc_id, validated(doc_id, party2=PARTY | {"title": None}))
    assert not is_complete(doc_id, validated(doc_id, party1=PARTY | {"company": "  "}))


@pytest.mark.parametrize(
    "missing",
    [
        {"purpose": None},
        {"governingLaw": "  "},
        {"jurisdiction": None},
        {"effectiveDate": "next Monday"},
        {"mndaExpires": None},
        {"mndaTermYears": None},
        {"confidentialityPerpetual": None},
        {"confidentialityYears": None},
    ],
)
def test_nda_is_incomplete_without_a_required_detail(missing):
    assert not is_complete(NDA, validated(NDA, **missing))


def test_nda_needs_no_years_for_a_term_that_continues_or_is_perpetual():
    assert is_complete(NDA, validated(NDA, mndaExpires=False, mndaTermYears=None))
    assert is_complete(NDA, validated(NDA, confidentialityPerpetual=True, confidentialityYears=None))


def test_other_documents_need_every_term_and_a_valid_date():
    doc = "business-associate-agreement"
    assert not is_complete(doc, validated(doc, baaEffectiveDate="next Monday"))
    assert not is_complete(doc, validated(doc, limitations=" "))


@pytest.mark.parametrize(
    ("stage", "complete", "changed", "follow_up", "expected"),
    [
        ("collecting", False, True, False, "collecting"),
        ("collecting", True, True, False, "changes"),
        ("collecting", True, True, True, "collecting"),
        ("changes", True, False, False, "review"),
        ("changes", True, False, True, "changes"),
        ("review", True, True, False, "review"),
        ("review", True, False, True, "review"),
        ("confirmed", True, False, False, "confirmed"),
        ("confirmed", True, False, True, "confirmed"),
        ("confirmed", True, True, False, "review"),
        ("confirmed", True, True, True, "review"),
        ("confirmed", False, True, False, "collecting"),
    ],
)
def test_next_stage(stage, complete, changed, follow_up, expected):
    assert next_stage(stage, complete, changed, follow_up) == expected


def test_only_the_nda_review_request_leaves_out_the_defaults():
    assert fixed_question(NDA, "review") == REVIEW_REQUEST
    assert fixed_question("pilot-agreement", "review") == f"{DEFAULTS_NOTE} {REVIEW_REQUEST}"


def test_the_final_requests_are_separate():
    assert "Confirm details" not in CHANGES_QUESTION
    assert "changes" not in REVIEW_REQUEST
    assert "lawyer" in REVIEW_REQUEST and "lawyer" in CONFIRMED_NOTICE


@pytest.fixture
def fake_llm(monkeypatch):
    """Set .turn to what the model returns; the fields are empty (nothing new) by default."""
    fake = SimpleNamespace(turn={})

    def completion(**kwargs):
        schema = kwargs["response_format"]
        empty_fields = {k: None for k in schema.model_fields["fields"].annotation.model_fields}
        empty_party = dict.fromkeys(PARTY)
        output = {"fields": empty_fields | {"party1": empty_party, "party2": empty_party}, "reply": "Thanks.", "followUp": False, "question": ""}
        if "changedTerms" in schema.model_fields:
            output["changedTerms"] = dict.fromkeys(schema.model_fields["changedTerms"].annotation.model_fields)
        content = json.dumps(output | fake.turn)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])

    monkeypatch.setattr(chat, "completion", completion)
    return fake


def turn(client, doc_id, stage, current=None, text="No"):
    return client.post(
        "/api/chat",
        json={
            "document": doc_id,
            "messages": [{"role": "user", "content": text}],
            "fields": current or complete_fields(doc_id),
            "today": "2026-10-22",
            "stage": stage,
        },
    )


@pytest.mark.parametrize("doc_id", DOC_IDS)
def test_every_document_gets_the_same_final_steps(signed_in_client, fake_llm, doc_id):
    res = turn(signed_in_client, doc_id, "collecting").json()
    assert (res["reply"], res["stage"]) == (f"Thanks. {CHANGES_QUESTION}", "changes")

    res = turn(signed_in_client, doc_id, "changes").json()
    assert res["reply"] == f"Thanks. {fixed_question(doc_id, 'review')}"
    assert res["stage"] == "review"

    res = turn(signed_in_client, doc_id, "review").json()
    assert (res["reply"], res["stage"]) == (f"Thanks. {fixed_question(doc_id, 'review')}", "review")

    res = turn(signed_in_client, doc_id, "confirmed").json()
    assert (res["reply"], res["stage"]) == (f"Thanks. {CONFIRMED_NOTICE}", "confirmed")


@pytest.mark.parametrize("doc_id", [NDA, "pilot-agreement"])
def test_the_models_own_final_question_is_ignored(signed_in_client, fake_llm, doc_id):
    fake_llm.turn = {"question": "Any changes? If not, please click Confirm details."}
    res = turn(signed_in_client, doc_id, "collecting").json()
    assert res["reply"] == f"Thanks. {CHANGES_QUESTION}"


def test_a_follow_up_is_asked_and_the_stage_waits(signed_in_client, fake_llm):
    fake_llm.turn = {"followUp": True, "question": "What would you like to change?"}
    res = turn(signed_in_client, NDA, "changes", text="Yes").json()
    assert (res["reply"], res["stage"]) == ("Thanks. What would you like to change?", "changes")


def test_a_change_after_confirming_asks_for_review_again(signed_in_client, fake_llm):
    current = complete_fields(NDA)
    fake_llm.turn = {"fields": dict.fromkeys(current) | {"purpose": "A new deal", "party1": dict.fromkeys(PARTY), "party2": dict.fromkeys(PARTY)}}
    res = turn(signed_in_client, NDA, "confirmed", current, "Change the purpose").json()
    assert res["fields"]["purpose"] == "A new deal"
    assert (res["reply"], res["stage"]) == (f"Thanks. {REVIEW_REQUEST}", "review")


# PL-10: every turn asks something. While details are missing only the model can ask.
@pytest.mark.parametrize(
    ("stage", "current", "output"),
    [
        ("collecting", {"purpose": None}, {"question": " "}),
        ("changes", {}, {"followUp": True, "question": ""}),
    ],
    ids=["details-missing", "empty-follow-up"],
)
def test_no_question_fails_the_turn(signed_in_client, fake_llm, stage, current, output):
    fake_llm.turn = output
    assert turn(signed_in_client, NDA, stage, complete_fields(NDA) | current).status_code == 502


def test_a_correction_that_leaves_a_detail_missing_goes_back_to_collecting(signed_in_client, fake_llm):
    fake_llm.turn = {"question": "How many years?"}
    current = complete_fields(NDA) | {"mndaTermYears": None}
    res = turn(signed_in_client, NDA, "review", current).json()
    assert (res["reply"], res["stage"]) == ("Thanks. How many years?", "collecting")


@pytest.mark.parametrize("stage", ["done", None])
def test_chat_rejects_an_unknown_stage(signed_in_client, fake_llm, stage):
    assert turn(signed_in_client, NDA, stage).status_code == 422


@pytest.mark.parametrize("doc_id", [d for d in DOC_IDS if d != NDA])
def test_every_other_document_has_the_changes_term_as_a_routine_term(doc_id):
    assert "modifications" in [f["key"] for f in spec_fields(doc_id, routine=True)]


# PL-14: code checks are firm. The app says what is wrong instead of the model's reply, and the value is not used.
BAD_ADDRESS = "1 Main St, Dover, DE 1990"
EMPTY_NDA_TURN = dict.fromkeys(complete_fields(NDA)) | {"party1": dict.fromkeys(PARTY), "party2": dict.fromkeys(PARTY)}


def nda_turn(**given) -> dict:
    return {"fields": EMPTY_NDA_TURN | given, "reply": "Got it, thanks!", "question": "What is next?"}


@pytest.mark.parametrize(
    ("given", "says"),
    [
        ({"effectiveDate": "2027-02-30"}, "February 30, 2027 is not a real date."),
        ({"effectiveDate": "2027-13-01"}, "not a real calendar date"),
        ({"mndaTermYears": 11}, "whole number from 1 to 10"),
        ({"governingLaw": "the State of Delwaare"}, "Did you mean Delaware?"),
        ({"party1": dict.fromkeys(PARTY) | {"noticeAddress": BAD_ADDRESS}}, '"1990"'),
    ],
    ids=["impossible-date", "impossible-month", "years", "state", "zip"],
)
def test_a_rejected_value_is_explained_by_the_app_mid_interview(signed_in_client, fake_llm, given, says):
    fake_llm.turn = nda_turn(**given)
    current = {k: None for k in complete_fields(NDA)} | {"party1": dict.fromkeys(PARTY), "party2": dict.fromkeys(PARTY)}
    res = turn(signed_in_client, NDA, "collecting", current).json()
    assert says in res["reply"]
    assert "Got it" not in res["reply"] and "What is next?" not in res["reply"]
    assert res["fields"] == current
    assert res["stage"] == "collecting"


def test_a_rejected_correction_after_confirming_keeps_the_old_value_and_says_so(signed_in_client, fake_llm):
    fake_llm.turn = nda_turn(effectiveDate="2027-02-30")
    current = complete_fields(NDA)
    res = turn(signed_in_client, NDA, "confirmed", current, "Make it February 30").json()
    assert "February 30, 2027 is not a real date." in res["reply"]
    assert res["fields"]["effectiveDate"] == current["effectiveDate"]
    assert res["stage"] == "confirmed"


def test_a_good_change_beside_a_rejected_one_is_kept_and_needs_review(signed_in_client, fake_llm):
    fake_llm.turn = nda_turn(effectiveDate="2027-02-30", purpose="A new deal")
    res = turn(signed_in_client, NDA, "confirmed").json()
    assert res["fields"]["purpose"] == "A new deal"
    assert "not a real date" in res["reply"]
    assert res["stage"] == "review"


@pytest.mark.parametrize("stage", ["collecting", "changes"])
def test_a_rejected_value_stops_the_interview_moving_on(signed_in_client, fake_llm, stage):
    fake_llm.turn = nda_turn(effectiveDate="2027-02-30")
    assert turn(signed_in_client, NDA, stage).json()["stage"] == stage


def test_the_same_problem_is_said_once(signed_in_client, fake_llm):
    party = dict.fromkeys(PARTY) | {"noticeAddress": BAD_ADDRESS}
    fake_llm.turn = nda_turn(party1=party, party2=party)
    assert turn(signed_in_client, NDA, "collecting").json()["reply"].count('"1990"') == 1


def test_uptime_is_checked_only_on_the_service_level_agreement(signed_in_client, fake_llm):
    doc = "service-level-agreement"
    fake_llm.turn = {"fields": {k: None for k in complete_fields(doc)} | {"targetUptime": "101%", "party1": dict.fromkeys(PARTY), "party2": dict.fromkeys(PARTY)}}
    res = turn(signed_in_client, doc, "collecting").json()
    assert "at most 100%" in res["reply"]
    assert res["fields"]["targetUptime"] == "Agreed"


def test_a_date_on_another_document_is_rejected_the_same_way(signed_in_client, fake_llm):
    doc = "business-associate-agreement"
    fake_llm.turn = {"fields": {k: None for k in complete_fields(doc)} | {"baaEffectiveDate": "2027-02-30", "party1": dict.fromkeys(PARTY), "party2": dict.fromkeys(PARTY)}}
    res = turn(signed_in_client, doc, "collecting").json()
    assert "February 30, 2027 is not a real date." in res["reply"]
    assert res["fields"]["baaEffectiveDate"] == "2027-03-05"


def test_a_date_the_model_could_not_format_is_not_called_unreal(signed_in_client, fake_llm):
    fake_llm.turn = nda_turn(effectiveDate="March 5, 2027")
    reply = turn(signed_in_client, NDA, "collecting").json()["reply"]
    assert "the full date" in reply and "not a real" not in reply


# PL-14: the model sometimes copies an earlier message into its acknowledgement, question included.
ASKED_BEFORE = "Thanks for the address line. And could you provide the city, state and ZIP code?"


def turn_after(client, assistant_said):
    history = [{"role": "assistant", "content": assistant_said}, {"role": "user", "content": "200 Market Street, San Francisco, CA 94105"}]
    body = {"document": NDA, "messages": history, "fields": complete_fields(NDA) | {"purpose": None}, "today": "2026-10-22", "stage": "collecting"}
    return client.post("/api/chat", json=body).json()


def test_an_acknowledgement_copied_from_an_earlier_message_is_dropped(signed_in_client, fake_llm):
    fake_llm.turn = {"reply": ASKED_BEFORE, "question": "What is the purpose?"}
    assert turn_after(signed_in_client, ASKED_BEFORE)["reply"] == "What is the purpose?"


def test_part_of_an_earlier_message_counts_as_a_copy(signed_in_client, fake_llm):
    fake_llm.turn = {"reply": "Thanks for the address line.", "question": "What is the purpose?"}
    assert turn_after(signed_in_client, ASKED_BEFORE)["reply"] == "What is the purpose?"


def test_an_acknowledgement_with_a_question_is_dropped(signed_in_client, fake_llm):
    fake_llm.turn = {"reply": "Got it, is that everything?", "question": "What is the purpose?"}
    assert turn_after(signed_in_client, "Where is the notice address?")["reply"] == "What is the purpose?"


def test_a_new_acknowledgement_is_kept(signed_in_client, fake_llm):
    fake_llm.turn = {"reply": "Got the address, thank you!", "question": "What is the purpose?"}
    assert turn_after(signed_in_client, ASKED_BEFORE)["reply"] == "Got the address, thank you! What is the purpose?"


def test_a_dropped_acknowledgement_does_not_lose_the_final_question(signed_in_client, fake_llm):
    fake_llm.turn = {"reply": ASKED_BEFORE}
    history = [{"role": "assistant", "content": ASKED_BEFORE}, {"role": "user", "content": "No"}]
    body = {"document": NDA, "messages": history, "fields": complete_fields(NDA), "today": "2026-10-22", "stage": "collecting"}
    res = signed_in_client.post("/api/chat", json=body).json()
    assert (res["reply"], res["stage"]) == (CHANGES_QUESTION, "changes")
