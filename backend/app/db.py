"""SQLite access. The database is temporary: it is recreated on every start."""

import sqlite3
from contextlib import closing
from pathlib import Path

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
)
"""


def reset(path: Path) -> None:
    """Delete the database file, if any, and create an empty schema."""
    path.unlink(missing_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        conn.execute(SCHEMA)


def login(path: Path, name: str, email: str) -> dict:
    """Create the user, or update the name if the email exists. Returns the user row."""
    # closing() closes the connection; the inner `conn` block commits the transaction.
    with closing(sqlite3.connect(path)) as conn, conn:
        row = conn.execute(
            "INSERT INTO users (name, email) VALUES (?, ?) "
            "ON CONFLICT(email) DO UPDATE SET name = excluded.name "
            "RETURNING id, name, email",
            (name, email),
        ).fetchone()
    return {"id": row[0], "name": row[1], "email": row[2]}
