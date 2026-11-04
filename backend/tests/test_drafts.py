"""Checks saving, listing and reopening drafts, and that each user sees only their own."""

import pytest
from fastapi.testclient import TestClient

from app.documents import fields_model
from app.main import app
from tests.conftest import PASSWORD

MESSAGES = [
    {"role": "assistant", "content": "What do you need?"},
    {"role": "user", "content": "Mutual NDA"},
    {"role": "assistant", "content": "Who is the first party?"},
]


def empty_fields(document="mutual-nda"):
    return fields_model(document).model_validate(
        {name: None for name in fields_model(document).model_fields}
        | {party: dict.fromkeys(("name", "title", "company", "noticeAddress")) for party in ("party1", "party2")}
    ).model_dump()


def new_draft(document="mutual-nda", **change):
    return {"document": document, "messages": MESSAGES, "start": 2, "fields": empty_fields(document)} | change


def update(**change):
    return {"messages": MESSAGES, "start": 2, "fields": empty_fields(), "confirmed": False} | change


@pytest.fixture
def client(signed_in_client):
    return signed_in_client


def as_other_user():
    """A second client on the same app and database, with its own session cookie."""
    other = TestClient(app)
    other.post("/api/signup", json={"name": "Alan", "email": "alan@example.com", "password": PASSWORD})
    return other


def test_create_returns_a_summary_and_the_list_shows_it(client):
    res = client.post("/api/drafts", json=new_draft())
    assert res.status_code == 201
    summary = res.json()
    assert summary["document"] == "mutual-nda"
    assert summary["parties"] == []
    assert client.get("/api/drafts").json() == [summary]


def test_a_saved_draft_reopens_with_its_conversation_and_fields(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    fields = empty_fields()
    fields["governingLaw"] = "Delaware"
    messages = [*MESSAGES, {"role": "user", "content": "Acme"}, {"role": "assistant", "content": "Who signs?"}]
    assert client.put(f"/api/drafts/{draft_id}", json=update(messages=messages, fields=fields, confirmed=True)).status_code == 200

    draft = client.get(f"/api/drafts/{draft_id}").json()
    assert draft["document"] == "mutual-nda"
    assert draft["messages"] == messages
    assert draft["start"] == 2
    assert draft["fields"]["governingLaw"] == "Delaware"
    assert draft["confirmed"] is True


def test_a_draft_survives_logging_out_and_back_in(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    client.post("/api/logout")
    client.post("/api/login", json={"email": "ada@example.com", "password": PASSWORD})
    assert [d["id"] for d in client.get("/api/drafts").json()] == [draft_id]
    assert client.get(f"/api/drafts/{draft_id}").json()["messages"] == MESSAGES


def test_the_list_shows_known_parties_and_the_latest_change_first(client):
    first = client.post("/api/drafts", json=new_draft()).json()["id"]
    second = client.post("/api/drafts", json=new_draft("pilot-agreement")).json()["id"]
    assert [d["id"] for d in client.get("/api/drafts").json()] == [second, first]

    fields = empty_fields()
    fields["party1"]["company"] = "Acme Inc."
    client.put(f"/api/drafts/{first}", json=update(fields=fields))
    drafts = client.get("/api/drafts").json()
    assert [d["id"] for d in drafts] == [first, second]
    assert drafts[0]["parties"] == ["Acme Inc."]

    fields["party2"]["company"] = "Globex LLC"
    summary = client.put(f"/api/drafts/{first}", json=update(fields=fields)).json()
    assert summary["parties"] == ["Acme Inc.", "Globex LLC"]


def test_a_new_draft_is_not_confirmed(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    assert client.get(f"/api/drafts/{draft_id}").json()["confirmed"] is False


def test_invalid_values_in_fields_are_dropped_like_in_the_chat(client):
    fields = empty_fields() | {"effectiveDate": "next Monday"}
    draft_id = client.post("/api/drafts", json=new_draft(fields=fields)).json()["id"]
    assert client.get(f"/api/drafts/{draft_id}").json()["fields"]["effectiveDate"] is None


@pytest.mark.parametrize(
    "change",
    [
        {"document": "employment-contract"},
        {"fields": {"purpose": "missing everything else"}},
        {"messages": []},
        {"messages": [{"role": "system", "content": "hi"}]},
        {"messages": [{"role": "user", "content": "x" * 4001}]},
        {"start": -1},
        {"start": 4},
    ],
)
def test_create_rejects_invalid_drafts(client, change):
    assert client.post("/api/drafts", json=new_draft() | change).status_code == 422
    assert client.get("/api/drafts").json() == []


def test_update_checks_fields_against_the_stored_document(client):
    draft_id = client.post("/api/drafts", json=new_draft("pilot-agreement")).json()["id"]
    assert client.put(f"/api/drafts/{draft_id}", json=update(fields=empty_fields("mutual-nda"))).status_code == 422


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/drafts", None),
        ("post", "/api/drafts", new_draft()),
        ("get", "/api/drafts/1", None),
        ("put", "/api/drafts/1", update()),
    ],
)
def test_draft_routes_need_a_login(client, method, path, body):
    client.post("/api/logout")
    assert client.request(method, path, json=body).status_code == 401


def test_a_user_cannot_see_or_change_another_users_draft(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    other = as_other_user()

    assert other.get("/api/drafts").json() == []
    assert other.get(f"/api/drafts/{draft_id}").status_code == 404
    assert other.put(f"/api/drafts/{draft_id}", json=update(confirmed=True)).status_code == 404
    assert client.get(f"/api/drafts/{draft_id}").json()["confirmed"] is False


def test_unknown_draft_is_not_found(client):
    assert client.get("/api/drafts/999").status_code == 404
    assert client.put("/api/drafts/999", json=update()).status_code == 404


@pytest.mark.parametrize("draft_id", [0, -1, 2**63, 10**20, "abc"])
def test_impossible_draft_ids_are_rejected(client, draft_id):
    assert client.get(f"/api/drafts/{draft_id}").status_code == 422
    assert client.put(f"/api/drafts/{draft_id}", json=update()).status_code == 422
