"""Checks the /api routes and that the database is recreated on startup."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.documents import CATALOG, TEMPLATES_DIR
from app.main import app


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "test.db"
    monkeypatch.setenv("PRELEGAL_DB", str(path))
    return path


@pytest.fixture
def client(db_path):
    # The `with` block runs the app's startup, which creates the database.
    with TestClient(app) as c:
        yield c


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_documents_lists_the_catalog(client):
    assert client.get("/api/documents").json() == CATALOG


@pytest.mark.parametrize("entry", CATALOG, ids=lambda e: e["id"])
def test_template_returns_the_standard_terms(client, entry):
    res = client.get(f"/api/templates/{entry['id']}")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/markdown")
    # The Mutual NDA lists its cover page file first; the standard terms are always last.
    assert res.text == (TEMPLATES_DIR / entry["files"][-1]).read_text()


def test_template_rejects_unknown_documents(client):
    assert client.get("/api/templates/employment-contract").status_code == 422


def test_login_creates_user(client):
    res = client.post("/api/login", json={"name": " Ada Lovelace ", "email": " Ada@Example.com "})
    assert res.status_code == 200
    assert res.json() == {"id": 1, "name": "Ada Lovelace", "email": "ada@example.com"}


def test_login_again_with_same_email_updates_name(client, db_path):
    first = client.post("/api/login", json={"name": "Ada", "email": "ada@example.com"}).json()
    second = client.post("/api/login", json={"name": "Ada L.", "email": "ADA@example.com"}).json()
    assert second == {"id": first["id"], "name": "Ada L.", "email": "ada@example.com"}
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1


@pytest.mark.parametrize(
    "body",
    [
        {"name": "", "email": "ada@example.com"},
        {"name": "   ", "email": "ada@example.com"},
        {"name": "Ada", "email": "not-an-email"},
        {"name": "Ada", "email": "ada @example.com"},
        {"name": "Ada"},
        {},
    ],
)
def test_login_rejects_invalid_input(client, body):
    assert client.post("/api/login", json=body).status_code == 422


def test_database_is_reset_on_startup(db_path):
    with TestClient(app) as c:
        c.post("/api/login", json={"name": "Ada", "email": "ada@example.com"})
    with TestClient(app):
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
