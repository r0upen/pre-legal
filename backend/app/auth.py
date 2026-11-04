"""Accounts: sign up, log in and log out, with a session cookie that identifies the user."""

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

from app import db

COOKIE = "prelegal_session"
SESSION_LIFETIME = timedelta(days=7)
# Hashing cost: slow enough to hinder guessing, about 16 MB and 50 ms per password.
SCRYPT = {"n": 2**14, "r": 8, "p": 1}

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Email = Annotated[
    str,
    StringConstraints(strip_whitespace=True, to_lower=True, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$"),
]
# Passwords are never stripped. The maximum only bounds the work of hashing.
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=128)]
Password = Annotated[str, StringConstraints(max_length=128)]


class SignupRequest(BaseModel):
    name: Name
    email: Email
    password: NewPassword


class LoginRequest(BaseModel):
    email: Email
    password: Password


class User(BaseModel):
    id: int
    name: str
    email: str


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}:{hashlib.scrypt(password.encode(), salt=salt, **SCRYPT).hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, digest = stored.split(":")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), **SCRYPT).hex()
    return hmac.compare_digest(candidate, digest)


# Checked when the email is unknown, so that a wrong email takes as long as a wrong password.
_UNKNOWN_USER_HASH = hash_password(secrets.token_urlsafe())


def _token_hash(token: str) -> str:
    # The database keeps only this hash, so a copy of it cannot be used to log in. A token has
    # enough randomness that plain SHA-256 is safe here, unlike for a password.
    return hashlib.sha256(token.encode()).hexdigest()


def _start_session(request: Request, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    db.create_session(request.app.state.db_path, _token_hash(token), user_id, datetime.now(UTC) + SESSION_LIFETIME)
    # HttpOnly: page scripts cannot read it. SameSite=Lax: other sites' requests do not carry it.
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        samesite="lax",
    )


def current_user(request: Request) -> User:
    """Route dependency: the logged-in user, or a 401."""
    token = request.cookies.get(COOKIE)
    user = token and db.session_user(request.app.state.db_path, _token_hash(token))
    if not user:
        raise HTTPException(401, "Please log in.")
    return User(**user)


CurrentUser = Annotated[User, Depends(current_user)]

router = APIRouter(prefix="/api")


@router.post("/signup", status_code=201)
def signup(body: SignupRequest, request: Request, response: Response) -> User:
    user = db.create_user(request.app.state.db_path, body.name, body.email, hash_password(body.password))
    if not user:
        raise HTTPException(409, "An account with this email already exists.")
    _start_session(request, response, user["id"])
    return User(**user)


@router.post("/login")
def login(body: LoginRequest, request: Request, response: Response) -> User:
    user = db.find_user_by_email(request.app.state.db_path, body.email)
    valid = verify_password(body.password, user["password_hash"] if user else _UNKNOWN_USER_HASH)
    if not (user and valid):
        raise HTTPException(401, "Wrong email or password.")
    _start_session(request, response, user["id"])
    return User(**user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    if token := request.cookies.get(COOKIE):
        db.delete_session(request.app.state.db_path, _token_hash(token))
    response.delete_cookie(COOKIE)


@router.get("/me")
def me(user: CurrentUser) -> User:
    return user
