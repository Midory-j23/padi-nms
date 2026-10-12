"""Background job: copies LibreNMS logs into MongoDB so they are kept in the app's own database.

Runs inside the backend process. Never raises; if LibreNMS or MongoDB is down it just tries again next round.
"""
import asyncio
import logging

from app.config import settings
from app.services import db, librenms as lnms

log = logging.getLogger("librenms-ui")
KINDS = ("eventlog", "syslog", "alertlog")
FIRST_RUN_PAGES = 5   # first round goes back a few pages; later rounds only need the newest page
PAGE_SIZE = 500


async def _hostnames() -> dict:
    try:
        raw = await lnms.request("GET", "/devices", {"type": "all"})
        return {int(d["device_id"]): d.get("hostname") for d in raw.get("devices", []) if d.get("device_id") is not None}
    except Exception:  # noqa: BLE001
        return {}


async def _round(pages: int) -> None:
    names = await _hostnames()
    for kind in KINDS:
        new = 0
        for page in range(1, pages + 1):
            try:
                raw = await lnms.request("GET", f"/logs/{kind}", {"start": page, "limit": PAGE_SIZE})
            except lnms.LibreNMSError as e:
                if e.code not in ("empty", "not_found"):
                    log.warning("Log collector: %s failed (%s)", kind, e.code)
                break
            logs = raw.get("logs", []) if isinstance(raw, dict) else []
            new += await db.store_logs(kind, logs, names)
            if len(logs) < PAGE_SIZE:
                break
        if new:
            log.info("Log collector: stored %d new %s entries", new, kind)


async def run() -> None:
    if settings.log_collect_interval <= 0 or not db.enabled():
        return
    pages = FIRST_RUN_PAGES
    while True:
        try:
            await _round(pages)
            pages = 1
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("Log collector round failed")
        await asyncio.sleep(max(10, settings.log_collect_interval))
