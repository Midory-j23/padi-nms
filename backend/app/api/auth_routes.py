"""Sign-in, sign-out, account and user management."""
import time

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app import auth
from app.auth import ONLINE_SECONDS, ROLES, current_user, db, require_admin
from app.services import db as mongo
from app.services.librenms import LibreNMSError

router = APIRouter(prefix="/api/auth")
users_router = APIRouter(prefix="/api/users", dependencies=[Depends(require_admin)])

BAD_LOGIN = "Incorrect username or password."


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _count(con, where: str = "", args: tuple = ()) -> int:
    return con.execute(f"SELECT COUNT(*) FROM users {where}", args).fetchone()[0]


def _active_admins(con) -> int:
    return _count(con, "WHERE role = 'admin' AND active = 1")


@router.get("/status")
def status():
    """Public: tells the login page whether this is a fresh install that still needs its first admin."""
    with auth._db_lock, db() as con:
        return {"data": {"needs_setup": _count(con) == 0}}


@router.post("/setup")
def setup(body: dict, request: Request, bg: BackgroundTasks):
    """Creates the first admin. Works only while there are no users at all."""
    username = auth.check_username(str(body.get("username", "")))
    password = str(body.get("password", ""))
    auth.check_new_password(password, username)
    full_name = str(body.get("full_name", "")).strip()[:80]
    with auth._db_lock, db() as con:
        if _count(con) > 0:
            raise LibreNMSError(409, "already_setup", "Setup is already finished. Please sign in.")
        cur = con.execute(
            "INSERT INTO users (username, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
            (username, full_name, auth.hash_password(password), "admin", time.time()))
        token, exp = auth.create_session(con, cur.lastrowid, bool(body.get("remember")))
        row = con.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        bg.add_task(mongo.sync_user, auth.user_record(con, cur.lastrowid))
        bg.add_task(mongo.audit, "user.create", True, username, "first administrator", None, username)
        return {"data": {"token": token, "expires_at": exp, "user": auth.public_user(row)}}


@router.post("/login")
def login(body: dict, request: Request, bg: BackgroundTasks):
    username = str(body.get("username", "")).strip().lower()[:64]
    password = str(body.get("password", ""))[:256]
    ip = _ip(request)
    auth.throttle_check(username, ip)
    with auth._db_lock, db() as con:
        row = con.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        ok = auth.verify_password(password, row["password_hash"] if row else auth._DUMMY_HASH)
        if not row or not ok or not row["active"]:
            auth.throttle_fail(username, ip)
            raise LibreNMSError(401, "bad_login", BAD_LOGIN)
        auth.throttle_ok(username)
        token, exp = auth.create_session(con, row["id"], bool(body.get("remember")))
        bg.add_task(mongo.sync_user, auth.user_record(con, row["id"]))  # keeps last_login current
        return {"data": {"token": token, "expires_at": exp, "user": auth.public_user(row)}}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return {"data": {k: v for k, v in user.items() if k != "token"}}


@router.post("/logout")
def logout(user: dict = Depends(current_user)):
    with auth._db_lock, db() as con:
        con.execute("DELETE FROM sessions WHERE token_hash = ?", (auth._th(user["token"]),))
    return {"data": {"ok": True}}


@router.post("/password")
def change_password(body: dict, user: dict = Depends(current_user)):
    cur_pw, new_pw = str(body.get("current_password", "")), str(body.get("new_password", ""))
    with auth._db_lock, db() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not auth.verify_password(cur_pw, row["password_hash"]):
            raise LibreNMSError(422, "bad_password", "The current password is not correct.")
        auth.check_new_password(new_pw, row["username"])
        con.execute("UPDATE users SET password_hash = ? WHERE id = ?", (auth.hash_password(new_pw), user["id"]))
        auth.revoke_sessions(con, user["id"], keep_token=user["token"])  # sign out every other device
    return {"data": {"ok": True}}


# ---------- user management (admin only) ----------
def _listing(con) -> list[dict]:
    now = time.time()
    rows = con.execute(
        """SELECT u.*, MAX(s.last_seen) AS seen, COUNT(s.token_hash) AS sessions
           FROM users u LEFT JOIN sessions s ON s.user_id = u.id AND s.expires_at > ?
           GROUP BY u.id ORDER BY u.role, u.username""", (now,)).fetchall()
    return [{**auth.public_user(r), "created_at": r["created_at"], "last_login": r["last_login"],
             "sessions": r["sessions"], "online": bool(r["seen"] and now - r["seen"] < ONLINE_SECONDS)} for r in rows]


@users_router.get("")
def list_users():
    with auth._db_lock, db() as con:
        return {"data": _listing(con)}


@users_router.post("")
def create_user(body: dict, bg: BackgroundTasks, admin: dict = Depends(require_admin)):
    username = auth.check_username(str(body.get("username", "")))
    password = str(body.get("password", ""))
    auth.check_new_password(password, username)
    role = body.get("role", "observer")
    if role not in ROLES:
        raise LibreNMSError(422, "invalid_role", "The role must be admin or observer.")
    full_name = str(body.get("full_name", "")).strip()[:80]
    with auth._db_lock, db() as con:
        if con.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise LibreNMSError(409, "exists", "That username is already taken.")
        cur = con.execute("INSERT INTO users (username, full_name, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)",
                          (username, full_name, auth.hash_password(password), role, time.time()))
        bg.add_task(mongo.sync_user, auth.user_record(con, cur.lastrowid))
        bg.add_task(mongo.audit, "user.create", True, username, None, {"role": role}, admin["username"])
        return {"data": _listing(con)}


@users_router.patch("/{user_id}")
def update_user(user_id: int, body: dict, bg: BackgroundTasks, admin: dict = Depends(require_admin)):
    with auth._db_lock, db() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise LibreNMSError(404, "not_found", "User not found.")
        sets, args, revoke = [], [], False
        if "role" in body:
            if body["role"] not in ROLES:
                raise LibreNMSError(422, "invalid_role", "The role must be admin or observer.")
            if body["role"] != row["role"]:
                if row["id"] == admin["id"]:
                    raise LibreNMSError(409, "self", "You cannot change your own role or status.")
                if row["role"] == "admin" and row["active"] and _active_admins(con) <= 1:
                    raise LibreNMSError(409, "last_admin", "There must be at least one active admin.")
                sets.append("role = ?"); args.append(body["role"]); revoke = True
        if "active" in body:
            active = 1 if body["active"] else 0
            if active != row["active"]:
                if row["id"] == admin["id"]:
                    raise LibreNMSError(409, "self", "You cannot change your own role or status.")
                if not active and row["role"] == "admin" and _active_admins(con) <= 1:
                    raise LibreNMSError(409, "last_admin", "There must be at least one active admin.")
                sets.append("active = ?"); args.append(active)
                revoke = revoke or not active
        if "full_name" in body:
            sets.append("full_name = ?"); args.append(str(body["full_name"]).strip()[:80])
        if body.get("password"):
            auth.check_new_password(str(body["password"]), row["username"])
            sets.append("password_hash = ?"); args.append(auth.hash_password(str(body["password"])))
            revoke = True
        if not sets:
            raise LibreNMSError(422, "invalid", "There is nothing to change.")
        con.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", (*args, user_id))
        if revoke:
            auth.revoke_sessions(con, user_id)
        bg.add_task(mongo.sync_user, auth.user_record(con, user_id))
        changed = sorted(k for k in ("role", "active", "full_name", "password") if k in body and (k != "password" or body.get("password")))
        bg.add_task(mongo.audit, "user.update", True, row["username"], None, {"fields": changed}, admin["username"])
        return {"data": _listing(con)}


@users_router.delete("/{user_id}")
def delete_user(user_id: int, bg: BackgroundTasks, admin: dict = Depends(require_admin)):
    with auth._db_lock, db() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise LibreNMSError(404, "not_found", "User not found.")
        if row["id"] == admin["id"]:
            raise LibreNMSError(409, "self", "You cannot delete your own account.")
        if row["role"] == "admin" and row["active"] and _active_admins(con) <= 1:
            raise LibreNMSError(409, "last_admin", "There must be at least one active admin.")
        con.execute("DELETE FROM users WHERE id = ?", (user_id,))
        bg.add_task(mongo.remove_user, row["username"])
        bg.add_task(mongo.audit, "user.delete", True, row["username"], None, None, admin["username"])
        return {"data": _listing(con)}
