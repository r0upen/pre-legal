"""Test clients shared by the API tests, each with its own temporary database."""

import pytest
from fastapi.testclient import TestClient

from app.main import app

PASSWORD = "correct horse"


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


@pytest.fixture
def signed_in_client(client):
    client.post("/api/signup", json={"name": "Ada", "email": "ada@example.com", "password": PASSWORD})
    return client
