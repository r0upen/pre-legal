"""Checks the /api routes and that the database is recreated on startup."""

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.documents import CATALOG, TEMPLATES_DIR
from app.main import app


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


def test_database_is_reset_on_startup(db_path):
    with TestClient(app) as c:
        c.post("/api/signup", json={"name": "Ada", "email": "ada@example.com", "password": "correct horse"})
    with TestClient(app):
        with sqlite3.connect(db_path) as conn:
            assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
