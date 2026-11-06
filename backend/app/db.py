"""SQLite access. The database is temporary: it is recreated on every start."""

import json
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    expires_at TEXT NOT NULL
);
-- messages and fields are JSON: fields differ per document and are never queried inside.
-- title is NULL until the user renames the draft.
CREATE TABLE drafts (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id),
    document_id TEXT NOT NULL,
    title TEXT,
    messages TEXT NOT NULL,
    start INTEGER NOT NULL,
    fields TEXT NOT NULL,
    stage TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""

DRAFT_COLUMNS = "id, document_id, title, messages, start, fields, stage, updated_at"


def reset(path: Path) -> None:
    """Delete the database file, if any, and create an empty schema."""
    path.unlink(missing_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        conn.executescript(SCHEMA)


def _connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def timestamp(moment: datetime | None = None) -> str:
    """A UTC time in one fixed format, so that comparing the text compares the times."""
    return (moment or datetime.now(UTC)).isoformat(timespec="milliseconds")


def create_user(path: Path, name: str, email: str, password_hash: str) -> dict | None:
    """Returns the new user, or None if the email is already taken."""
    # closing() closes the connection; the inner `conn` block commits the transaction.
    with closing(_connect(path)) as conn, conn:
        row = conn.execute(
            "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?) "
            "ON CONFLICT(email) DO NOTHING RETURNING id, name, email",
            (name, email, password_hash),
        ).fetchone()
    return dict(row) if row else None


def find_user_by_email(path: Path, email: str) -> dict | None:
    """The user including the password hash, which only the login check should see."""
    with closing(_connect(path)) as conn:
        row = conn.execute("SELECT id, name, email, password_hash FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def create_session(path: Path, token_hash: str, user_id: int, expires_at: datetime) -> None:
    with closing(_connect(path)) as conn, conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, timestamp(expires_at)),
        )


def session_user(path: Path, token_hash: str) -> dict | None:
    """The user a session belongs to, or None if it is unknown or expired."""
    with closing(_connect(path)) as conn:
        row = conn.execute(
            "SELECT users.id, users.name, users.email FROM sessions "
            "JOIN users ON users.id = sessions.user_id "
            "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            (token_hash, timestamp()),
        ).fetchone()
    return dict(row) if row else None


def delete_session(path: Path, token_hash: str) -> None:
    with closing(_connect(path)) as conn, conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def _draft(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "document": row["document_id"],
        "title": row["title"],
        "messages": json.loads(row["messages"]),
        "start": row["start"],
        "fields": json.loads(row["fields"]),
        "stage": row["stage"],
        "updatedAt": row["updated_at"],
    }


def create_draft(path: Path, user_id: int, document: str, messages: list[dict], start: int, fields: dict) -> dict:
    with closing(_connect(path)) as conn, conn:
        row = conn.execute(
            "INSERT INTO drafts (user_id, document_id, messages, start, fields, stage, updated_at) "
            f"VALUES (?, ?, ?, ?, ?, 'collecting', ?) RETURNING {DRAFT_COLUMNS}",
            (user_id, document, json.dumps(messages), start, json.dumps(fields), timestamp()),
        ).fetchone()
    return _draft(row)


def list_drafts(path: Path, user_id: int) -> list[dict]:
    """The user's drafts, most recently changed first."""
    with closing(_connect(path)) as conn:
        rows = conn.execute(
            f"SELECT {DRAFT_COLUMNS} FROM drafts WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
            (user_id,),
        ).fetchall()
    return [_draft(row) for row in rows]


# Every query filters on user_id, so nobody can reach another user's draft by guessing its id.
def get_draft(path: Path, user_id: int, draft_id: int) -> dict | None:
    with closing(_connect(path)) as conn:
        row = conn.execute(
            f"SELECT {DRAFT_COLUMNS} FROM drafts WHERE id = ? AND user_id = ?",
            (draft_id, user_id),
        ).fetchone()
    return _draft(row) if row else None


def update_draft(
    path: Path, user_id: int, draft_id: int, messages: list[dict], start: int, fields: dict, stage: str
) -> dict | None:
    with closing(_connect(path)) as conn, conn:
        row = conn.execute(
            "UPDATE drafts SET messages = ?, start = ?, fields = ?, stage = ?, updated_at = ? "
            f"WHERE id = ? AND user_id = ? RETURNING {DRAFT_COLUMNS}",
            (json.dumps(messages), start, json.dumps(fields), stage, timestamp(), draft_id, user_id),
        ).fetchone()
    return _draft(row) if row else None


def rename_draft(path: Path, user_id: int, draft_id: int, title: str) -> dict | None:
    """Leaves updated_at alone: that time means the last change to the agreement itself."""
    with closing(_connect(path)) as conn, conn:
        row = conn.execute(
            f"UPDATE drafts SET title = ? WHERE id = ? AND user_id = ? RETURNING {DRAFT_COLUMNS}",
            (title, draft_id, user_id),
        ).fetchone()
    return _draft(row) if row else None


def delete_draft(path: Path, user_id: int, draft_id: int) -> bool:
    """Returns whether a draft was deleted."""
    with closing(_connect(path)) as conn, conn:
        cursor = conn.execute("DELETE FROM drafts WHERE id = ? AND user_id = ?", (draft_id, user_id))
    return cursor.rowcount > 0
