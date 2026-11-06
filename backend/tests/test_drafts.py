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
    return {"messages": MESSAGES, "start": 2, "fields": empty_fields(), "stage": "collecting"} | change


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
    assert client.put(f"/api/drafts/{draft_id}", json=update(messages=messages, fields=fields, stage="confirmed")).status_code == 200

    draft = client.get(f"/api/drafts/{draft_id}").json()
    assert draft["document"] == "mutual-nda"
    assert draft["messages"] == messages
    assert draft["start"] == 2
    assert draft["fields"]["governingLaw"] == "Delaware"
    assert draft["stage"] == "confirmed"


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


def test_a_new_draft_starts_collecting(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    assert client.get(f"/api/drafts/{draft_id}").json()["stage"] == "collecting"


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
        ("patch", "/api/drafts/1", {"title": "Acme deal"}),
        ("delete", "/api/drafts/1", None),
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
    assert other.put(f"/api/drafts/{draft_id}", json=update(stage="confirmed")).status_code == 404
    assert client.get(f"/api/drafts/{draft_id}").json()["stage"] == "collecting"


def test_a_user_cannot_rename_or_delete_another_users_draft(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    other = as_other_user()

    assert other.patch(f"/api/drafts/{draft_id}", json={"title": "Stolen"}).status_code == 404
    assert other.delete(f"/api/drafts/{draft_id}").status_code == 404
    drafts = client.get("/api/drafts").json()
    assert [(d["id"], d["title"]) for d in drafts] == [(draft_id, None)]


def test_unknown_draft_is_not_found(client):
    assert client.get("/api/drafts/999").status_code == 404
    assert client.put("/api/drafts/999", json=update()).status_code == 404
    assert client.patch("/api/drafts/999", json={"title": "Acme deal"}).status_code == 404
    assert client.delete("/api/drafts/999").status_code == 404


@pytest.mark.parametrize("draft_id", [0, -1, 2**63, 10**20, "abc"])
def test_impossible_draft_ids_are_rejected(client, draft_id):
    assert client.get(f"/api/drafts/{draft_id}").status_code == 422
    assert client.put(f"/api/drafts/{draft_id}", json=update()).status_code == 422
    assert client.patch(f"/api/drafts/{draft_id}", json={"title": "Acme deal"}).status_code == 422
    assert client.delete(f"/api/drafts/{draft_id}").status_code == 422


def test_a_new_name_shows_in_the_list_and_survives_logging_out_and_back_in(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    res = client.patch(f"/api/drafts/{draft_id}", json={"title": "  Acme deal  "})
    assert res.status_code == 200
    assert res.json()["title"] == "Acme deal"

    client.post("/api/logout")
    client.post("/api/login", json={"email": "ada@example.com", "password": PASSWORD})
    assert client.get("/api/drafts").json()[0]["title"] == "Acme deal"


def test_renaming_keeps_the_drafts_place_and_date(client):
    first = client.post("/api/drafts", json=new_draft()).json()
    second = client.post("/api/drafts", json=new_draft()).json()
    renamed = client.patch(f"/api/drafts/{first['id']}", json={"title": "Acme deal"}).json()
    assert renamed["updatedAt"] == first["updatedAt"]
    assert [d["id"] for d in client.get("/api/drafts").json()] == [second["id"], first["id"]]


def test_autosave_keeps_the_new_name(client):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    client.patch(f"/api/drafts/{draft_id}", json={"title": "Acme deal"})
    assert client.put(f"/api/drafts/{draft_id}", json=update()).json()["title"] == "Acme deal"


@pytest.mark.parametrize("title", ["", "   ", "x" * 101, None])
def test_rename_rejects_invalid_names(client, title):
    draft_id = client.post("/api/drafts", json=new_draft()).json()["id"]
    assert client.patch(f"/api/drafts/{draft_id}", json={"title": title}).status_code == 422
    assert client.get("/api/drafts").json()[0]["title"] is None


def test_a_deleted_draft_is_gone_and_others_stay(client):
    kept = client.post("/api/drafts", json=new_draft()).json()["id"]
    deleted = client.post("/api/drafts", json=new_draft()).json()["id"]

    res = client.delete(f"/api/drafts/{deleted}")
    assert res.status_code == 204
    assert res.content == b""
    assert [d["id"] for d in client.get("/api/drafts").json()] == [kept]
    assert client.get(f"/api/drafts/{deleted}").status_code == 404
    assert client.put(f"/api/drafts/{deleted}", json=update()).status_code == 404
    assert client.patch(f"/api/drafts/{deleted}", json={"title": "Back"}).status_code == 404
    assert client.delete(f"/api/drafts/{deleted}").status_code == 404
