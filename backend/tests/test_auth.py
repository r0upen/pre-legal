"""Checks signing up, logging in and out, and that the AI routes need a login."""

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import COOKIE, hash_password, verify_password
from app.main import app

ADA = {"name": "Ada Lovelace", "email": "ada@example.com", "password": "correct horse"}


def test_signup_creates_the_user_and_logs_in(client):
    res = client.post("/api/signup", json=ADA | {"name": " Ada Lovelace ", "email": " Ada@Example.com "})
    assert res.status_code == 201
    assert res.json() == {"id": 1, "name": "Ada Lovelace", "email": "ada@example.com"}
    assert client.get("/api/me").json() == res.json()


def test_session_cookie_cannot_be_read_by_scripts_or_sent_by_other_sites(client):
    cookie = client.post("/api/signup", json=ADA).headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "max-age=604800" in cookie


def test_signup_rejects_an_email_already_taken(client):
    client.post("/api/signup", json=ADA)
    res = client.post("/api/signup", json=ADA | {"email": "ADA@example.com", "password": "another password"})
    assert res.status_code == 409
    # The first account's password still works.
    assert client.post("/api/login", json={"email": ADA["email"], "password": ADA["password"]}).status_code == 200


@pytest.mark.parametrize(
    "change",
    [
        {"name": ""},
        {"name": "   "},
        {"email": "not-an-email"},
        {"email": "ada @example.com"},
        {"password": "short"},
        {"password": "x" * 129},
    ],
)
def test_signup_rejects_invalid_input(client, change):
    assert client.post("/api/signup", json=ADA | change).status_code == 422


def test_passwords_are_stored_only_as_salted_hashes(client, db_path):
    client.post("/api/signup", json=ADA)
    client.post("/api/signup", json=ADA | {"email": "alan@example.com"})
    with sqlite3.connect(db_path) as conn:
        hashes = [row[0] for row in conn.execute("SELECT password_hash FROM users")]
    assert all(ADA["password"] not in h for h in hashes)
    assert hashes[0] != hashes[1]


def test_verify_password():
    stored = hash_password("correct horse")
    assert verify_password("correct horse", stored)
    assert not verify_password("wrong horse", stored)


def test_login_and_logout_round_trip(client):
    client.post("/api/signup", json=ADA)
    assert client.post("/api/logout").status_code == 204
    assert client.get("/api/me").status_code == 401

    res = client.post("/api/login", json={"email": " ADA@example.com ", "password": ADA["password"]})
    assert res.status_code == 200
    assert client.get("/api/me").json()["name"] == "Ada Lovelace"


def test_logout_ends_the_session_on_the_server(client):
    client.post("/api/signup", json=ADA)
    token = client.cookies[COOKIE]
    client.post("/api/logout")
    # The old cookie no longer works, even if a copy of it was kept.
    client.cookies.set(COOKIE, token)
    assert client.get("/api/me").status_code == 401


def test_logout_without_a_session_succeeds(client):
    assert client.post("/api/logout").status_code == 204


@pytest.mark.parametrize(
    "credentials",
    [
        {"email": ADA["email"], "password": "wrong password"},
        {"email": "nobody@example.com", "password": ADA["password"]},
    ],
)
def test_wrong_email_and_wrong_password_look_the_same(client, credentials):
    client.post("/api/signup", json=ADA)
    client.post("/api/logout")
    res = client.post("/api/login", json=credentials)
    assert res.status_code == 401
    assert res.json() == {"detail": "Wrong email or password."}
    assert COOKIE not in client.cookies


def test_session_token_is_not_stored_in_the_database(client, db_path):
    client.post("/api/signup", json=ADA)
    with sqlite3.connect(db_path) as conn:
        stored = conn.execute("SELECT token_hash FROM sessions").fetchone()[0]
    assert stored != client.cookies[COOKIE]


def test_expired_session_is_rejected(client, db_path):
    user = client.post("/api/signup", json=ADA).json()
    db.create_session(db_path, "expired-hash", user["id"], datetime.now(UTC) - timedelta(seconds=1))
    assert db.session_user(db_path, "expired-hash") is None


def test_session_ends_when_the_database_resets(db_path):
    with TestClient(app) as c:
        c.post("/api/signup", json=ADA)
        token = c.cookies[COOKIE]
    with TestClient(app) as c:
        c.cookies.set(COOKIE, token)
        assert c.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/choose", {"messages": [{"role": "user", "content": "An NDA"}]}),
        ("/api/chat", {}),
    ],
)
def test_ai_routes_need_a_login(client, path, body):
    assert client.post(path, json=body).status_code == 401
