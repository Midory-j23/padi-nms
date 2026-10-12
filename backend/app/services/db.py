"""MongoDB storage for the app's own data: the devices added through the UI, the app's users, and an audit log.

LibreNMS stays the source of truth for monitoring. This module never stores SNMP communities or
passwords, and the users collection never holds password hashes (sign-in itself stays in SQLite). Write helpers never raise: if MongoDB is off or down, monitoring and the add/remove
actions keep working and the problem is only logged. Read helpers raise a user-safe error.
"""
import asyncio
import logging
import re
import time
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import AsyncMongoClient, ReturnDocument
from pymongo.errors import OperationFailure

from app.config import settings
from app.services.librenms import LibreNMSError

log = logging.getLogger("librenms-ui")

_client: Optional[AsyncMongoClient] = None
# When MongoDB cannot be reached, skip it for a while instead of making every request wait for the timeout.
RETRY_AFTER = 30.0
_down_until = 0.0
DEVICES = "devices"      # every device added through the app
USERS = "app_users"      # read-only copy of the app's users (no passwords); sign-in itself stays in SQLite
AUDIT = "audit_log"


def enabled() -> bool:
    return bool(settings.mongodb_uri.strip())


def _db():
    global _client
    if _client is None:
        _client = AsyncMongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000, connectTimeoutMS=2000,
                                   appname="padi-nms")
    return _client[settings.mongodb_db]


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await asyncio.wait_for(_client.close(), 2)  # never let a stuck connection hold up shutdown
        except Exception:  # noqa: BLE001
            pass
        _client = None


def _is_down() -> bool:
    return time.monotonic() < _down_until


def _mark_down() -> None:
    global _down_until
    _down_until = time.monotonic() + RETRY_AFTER


def _mark_up() -> None:
    global _down_until
    _down_until = 0.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


_URI_CREDS = re.compile(r"(mongodb(?:\+srv)?://)[^@/\s]*@", re.IGNORECASE)


def _warn(what: str, e: Exception) -> None:
    # Log the error type and a short message, with any user:password in a connection string blanked out.
    msg = _URI_CREDS.sub(r"\1***@", str(e).splitlines()[0][:200]) if str(e) else ""
    log.warning("MongoDB: %s failed (%s: %s)", what, type(e).__name__, msg)
    if not isinstance(e, OperationFailure):  # the server answered (e.g. a rule rejected the data): not an outage
        _mark_down()


def _ser(doc: dict) -> dict:
    out: dict[str, Any] = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, datetime):
            out[k] = (v if v.tzinfo else v.replace(tzinfo=timezone.utc)).isoformat().replace("+00:00", "Z")
        else:
            out[k] = v
    return out


def _unavailable() -> LibreNMSError:
    return LibreNMSError(503, "database_unavailable", "The database is not reachable.")


def _int_or_none(v) -> Optional[int]:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ---------- status ----------
async def check() -> str:
    """'off' (not configured), 'ok' or 'error'."""
    if not enabled():
        return "off"
    if _is_down():
        return "error"
    try:
        await _db().command("ping")
        _mark_up()
        return "ok"
    except Exception as e:  # noqa: BLE001
        _warn("ping", e)
        return "error"


# ---------- writes (never raise) ----------
async def audit(action: str, ok: bool, target: Optional[str] = None, message: Optional[str] = None,
                details: Optional[dict] = None, actor: Optional[str] = None) -> None:
    if not enabled() or _is_down():
        return
    try:
        await _db()[AUDIT].insert_one({"at": _now(), "actor": actor, "action": action, "target": target,
                                          "ok": ok, "message": message, "details": details or {}})
    except Exception as e:  # noqa: BLE001
        _warn("audit write", e)


async def record_device_added(*, hostname: str, display_name: Optional[str], type_: str, snmp_version: Optional[str],
                              location: Optional[str], device_id, source: str, actor: Optional[str] = None) -> None:
    if not enabled() or _is_down():
        return
    lc = hostname.strip().lower()
    fields = {"display_name": display_name or None, "type": type_, "snmp_version": snmp_version,
              "location": location or None, "librenms_device_id": _int_or_none(device_id)}
    # Values we know go in $set; the rest only fill in for a brand-new record, so re-adding never wipes edits.
    set_ = {k: v for k, v in fields.items() if v is not None}
    on_insert = {k: None for k, v in fields.items() if v is None}
    on_insert.update({"hostname": hostname.strip(), "hostname_lc": lc, "status": "active", "source": source,
                      "owner": None, "notes": None, "added_by": actor, "added_at": _now(), "removed_at": None})
    try:
        await _db()[DEVICES].find_one_and_update({"hostname_lc": lc, "status": "active"},
                                                {"$set": set_, "$setOnInsert": on_insert} if set_ else {"$setOnInsert": on_insert},
                                                upsert=True)
    except Exception as e:  # noqa: BLE001
        _warn("device write", e)


async def mirror_device_edit(identifier: str, changes: dict) -> Optional[str]:
    """Copy display-name / location edits made through the app onto the matching active device record."""
    if not enabled() or _is_down() or not changes:
        return None
    try:
        ors: list[dict] = [{"hostname_lc": str(identifier).strip().lower()}]
        n = _int_or_none(identifier)
        if n is not None:
            ors.append({"librenms_device_id": n})
        doc = await _db()[DEVICES].find_one_and_update({"status": "active", "$or": ors}, {"$set": changes})
        return doc.get("hostname") if doc else None
    except Exception as e:  # noqa: BLE001
        _warn("device mirror", e)
        return None


async def record_device_removed(identifier: str) -> Optional[str]:
    """Mark the active device matching a LibreNMS device id or host name as removed. Returns its host name."""
    if not enabled() or _is_down():
        return None
    try:
        ors: list[dict] = [{"hostname_lc": str(identifier).strip().lower()}]
        n = _int_or_none(identifier)
        if n is not None:
            ors.append({"librenms_device_id": n})
        doc = await _db()[DEVICES].find_one_and_update({"status": "active", "$or": ors},
                                                      {"$set": {"status": "removed", "removed_at": _now()}})
        return doc.get("hostname") if doc else None
    except Exception as e:  # noqa: BLE001
        _warn("device remove", e)
        return None


# ---------- reads (raise a user-safe error) ----------
async def list_audit(limit: int = 200) -> list[dict]:
    if not enabled():
        return []
    if _is_down():
        raise _unavailable()
    try:
        cur = _db()[AUDIT].find({}).sort("at", -1).limit(limit)
        return [_ser(d) for d in await cur.to_list(length=limit)]
    except Exception as e:  # noqa: BLE001
        _warn("audit list", e)
        raise _unavailable() from None


# ---------- start-up: indexes, one-time copy of the old `clients` collection, user sync ----------
async def init(users: list[dict]) -> None:
    """Called once at start-up. Never raises: if MongoDB is down the app still starts."""
    if not enabled():
        log.info("MongoDB: not configured (MONGODB_URI is empty); devices and users are not stored there.")
        return
    try:
        db = _db()
        await db.command("ping")
        _mark_up()
        # Indexes are a convenience: one that already exists under another name (e.g. from setup.js) must not stop start-up.
        for coll, keys, kw in ((DEVICES, [("hostname_lc", 1), ("status", 1)], {}), (DEVICES, "librenms_device_id", {}),
                               (USERS, "username", {"unique": True}), (AUDIT, [("at", -1)], {})):
            try:
                await db[coll].create_index(keys, **kw)
            except Exception as e:  # noqa: BLE001
                log.info("MongoDB: index on %s skipped (%s)", coll, type(e).__name__)
        try:
            # Earlier versions kept the devices in a collection called `clients`. Copy them once; the old one is left alone.
            names = await db.list_collection_names()
            if "clients" in names and await db[DEVICES].estimated_document_count() == 0:
                old = await db["clients"].find({}).to_list(length=None)
                for d in old:
                    d.setdefault("status", "active")
                if old:
                    await db[DEVICES].insert_many(old)
                    log.info("MongoDB: copied %d devices from `clients` to `%s`.", len(old), DEVICES)
        except Exception as e:  # noqa: BLE001
            _warn("copy from clients", e)
        await sync_users(users)
        log.info("MongoDB: ready (database '%s').", settings.mongodb_db)
    except Exception as e:  # noqa: BLE001
        _warn("start-up", e)


# ---------- users (copy of what is in SQLite; never contains passwords) ----------
def _ts(v) -> Optional[datetime]:
    return datetime.fromtimestamp(v, tz=timezone.utc) if v else None


def _user_doc(u: dict) -> dict:
    return {"username": u["username"], "full_name": u.get("full_name") or "", "role": u["role"],
            "active": bool(u.get("active")), "created_at": _ts(u.get("created_at")),
            "last_login": _ts(u.get("last_login")), "local_id": u.get("id"), "synced_at": _now()}


async def sync_user(u: dict) -> None:
    """Create or update one user's record."""
    if not enabled() or _is_down():
        return
    try:
        await _db()[USERS].replace_one({"username": u["username"]}, _user_doc(u), upsert=True)
    except Exception as e:  # noqa: BLE001
        _warn("user sync", e)


async def sync_users(users: list[dict]) -> None:
    """Make the collection match the full user list (used at start-up)."""
    if not enabled() or _is_down():
        return
    try:
        for u in users:
            await _db()[USERS].replace_one({"username": u["username"]}, _user_doc(u), upsert=True)
        await _db()[USERS].delete_many({"username": {"$nin": [u["username"] for u in users]}})
    except Exception as e:  # noqa: BLE001
        _warn("users sync", e)


async def remove_user(username: str) -> None:
    if not enabled() or _is_down():
        return
    try:
        await _db()[USERS].delete_one({"username": username})
    except Exception as e:  # noqa: BLE001
        _warn("user remove", e)
