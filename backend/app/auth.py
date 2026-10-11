"""Users, roles, sessions and the access rules for the API.

Roles
  admin     everything: users, settings, add / edit / remove devices, scans, acknowledging alerts
  observer  read only

Passwords are hashed with scrypt (standard library). Session tokens are random, only their SHA-256 is stored.
"""
import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import Request

from app.config import settings
from app.services.librenms import LibreNMSError

ROLES = ("admin", "observer")
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
# Only admins may even read these (user list, LibreNMS connection, active scanning).
ADMIN_ONLY_PREFIXES = ("/api/settings", "/api/users", "/api/discovery")
ONLINE_SECONDS = 5 * 60

_db_lock = threading.Lock()


def _db_path() -> Path:
    if settings.auth_db_path:
        return Path(settings.auth_db_path)
    return Path(__file__).resolve().parents[1] / "data" / "padi.db"


@contextmanager
def db():
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        _init(con)
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def _init(con: sqlite3.Connection):
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            full_name TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('admin', 'observer')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at REAL NOT NULL,
            last_login REAL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            last_seen REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        """
    )


# ---------- passwords ----------
_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${salt.hex()}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, h = stored.split("$")
        calc = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except Exception:
        return False


_DUMMY_HASH = hash_password(secrets.token_hex(8))  # so an unknown user costs the same time as a wrong password


def check_new_password(password: str, username: str = ""):
    if not isinstance(password, str) or len(password) < 8:
        raise LibreNMSError(422, "weak_password", "The password must be at least 8 characters.")
    if len(password) > 128:
        raise LibreNMSError(422, "weak_password", "The password is too long.")
    if username and password.lower() == username.lower():
        raise LibreNMSError(422, "weak_password", "The password must be different from the username.")


def check_username(username: str) -> str:
    u = (username or "").strip()
    if not USERNAME_RE.fullmatch(u):
        raise LibreNMSError(422, "invalid_username", "The username must be 3-32 letters, numbers, dots, dashes or underscores.")
    return u.lower()


# ---------- login throttling (in memory) ----------
_fails: dict[str, list] = {}  # key -> [count, window_start, locked_until]
_LIMITS = {"u": 6, "ip": 25}
_WINDOW, _LOCK = 600, 300


def _bucket(key: str):
    return _fails.setdefault(key, [0, time.time(), 0.0])


def throttle_check(username: str, ip: str):
    now = time.time()
    for key in (f"u:{username}", f"ip:{ip}"):
        b = _fails.get(key)
        if b and b[2] > now:
            raise LibreNMSError(429, "too_many_attempts", "Too many failed attempts. Try again in a few minutes.")


def throttle_fail(username: str, ip: str):
    now = time.time()
    for kind, key in (("u", f"u:{username}"), ("ip", f"ip:{ip}")):
        b = _bucket(key)
        if now - b[1] > _WINDOW:
            b[0], b[1] = 0, now
        b[0] += 1
        if b[0] >= _LIMITS[kind]:
            b[2] = now + _LOCK
            b[0], b[1] = 0, now


def throttle_ok(username: str):
    _fails.pop(f"u:{username}", None)


# ---------- sessions ----------
def _th(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(con: sqlite3.Connection, user_id: int, remember: bool) -> tuple[str, float]:
    token = secrets.token_urlsafe(32)
    now = time.time()
    ttl = settings.session_remember_days * 86400 if remember else settings.session_hours * 3600
    con.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
    con.execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen) VALUES (?,?,?,?,?)",
                (_th(token), user_id, now, now + ttl, now))
    con.execute("UPDATE users SET last_login = ? WHERE id = ?", (now, user_id))
    return token, now + ttl


def revoke_sessions(con: sqlite3.Connection, user_id: int, keep_token: Optional[str] = None):
    if keep_token:
        con.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, _th(keep_token)))
    else:
        con.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))


def public_user(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "full_name": row["full_name"], "role": row["role"],
            "active": bool(row["active"])}


def bearer(request: Request) -> Optional[str]:
    h = request.headers.get("authorization", "")
    return h[7:].strip() if h[:7].lower() == "bearer " and len(h) > 7 else None


def user_from_request(request: Request) -> dict:
    token = bearer(request)
    if not token:
        raise LibreNMSError(401, "unauthorized", "Please sign in.")
    now = time.time()
    with _db_lock, db() as con:
        row = con.execute(
            "SELECT u.*, s.last_seen AS s_seen FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?", (_th(token), now)).fetchone()
        if not row or not row["active"]:
            raise LibreNMSError(401, "unauthorized", "Please sign in.")
        if now - row["s_seen"] > 60:  # keep the "online" marker fresh without writing on every request
            con.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", (now, _th(token)))
        user = public_user(row)
        user["token"] = token
        return user


# ---------- FastAPI dependencies ----------
def current_user(request: Request) -> dict:
    return user_from_request(request)


def require_admin(request: Request) -> dict:
    user = user_from_request(request)
    if user["role"] != "admin":
        raise LibreNMSError(403, "forbidden", "You do not have permission to do this.")
    return user


def authorize(request: Request) -> dict:
    """Applied to every data route: sign-in required, observers are read-only."""
    user = user_from_request(request)
    if user["role"] != "admin":
        if request.method not in SAFE_METHODS or request.url.path.startswith(ADMIN_ONLY_PREFIXES):
            raise LibreNMSError(403, "forbidden", "You do not have permission to do this.")
    return user
