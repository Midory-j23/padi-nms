"""Backend endpoints. Every LibreNMS route used here was verified against docs.librenms.org/API.
Comments tagged UNVERIFIED mark field names or parameters not confirmed by the docs."""
import asyncio
import time
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Query, Response
from pydantic import AliasChoices, BaseModel, Field

from app.config import settings
from app.services import librenms as lnms
from app.services.librenms import LibreNMSError

router = APIRouter(prefix="/api")

# Docs strongly recommend `columns` on /ports. *_rate / *_delta names come from the documented
# port output; unit of *_octets_rate (bytes/s vs bits/s) is UNVERIFIED, so utilization is not computed here.
PORT_COLUMNS = ("port_id,device_id,ifName,ifAlias,ifDescr,ifOperStatus,ifAdminStatus,ifSpeed,"
                "ifInOctets_rate,ifOutOctets_rate,ifInUcastPkts_rate,ifOutUcastPkts_rate,"
                "ifInErrors_delta,ifOutErrors_delta")


# ---------- helpers ----------
def ok(data, **extra):
    return {"source": lnms.state["source"], "data": data, **extra}


def num(v, d=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def sort_key(v):
    if v is None or v == "":
        return (1, 0, "")
    try:
        return (0, float(v), "")
    except (TypeError, ValueError):
        return (0, 0, str(v).lower())


def paginate(items, page, per_page):
    s = (page - 1) * per_page
    return items[s:s + per_page], len(items)


def q(v) -> str:
    return quote(str(v), safe="")


async def device_names() -> dict:
    raw = await lnms.get("/devices", {"type": "all"}, ttl=60)
    return {str(d.get("device_id")): d.get("hostname") for d in raw.get("devices", [])}


def port_state(p) -> str:
    if p.get("ifAdminStatus") == "down":
        return "disabled"
    return "up" if p.get("ifOperStatus") == "up" else "down"


def flatten(v):
    for i in v:
        if isinstance(i, list):
            yield from flatten(i)
        elif isinstance(i, dict):
            yield i


# ---------- health / settings ----------
@router.get("/health")
async def health():
    t = time.perf_counter()
    try:
        await lnms.get("/ping", ttl=0)
        sysinfo = await lnms.get("/system", ttl=300)
        ver = (sysinfo.get("system") or [{}])[0].get("local_ver")
        src = lnms.state["source"]
        return {"status": "ok", "source": src, "configured": bool(settings.librenms_url and settings.librenms_api_token),
                "connected": src == "live", "using_mock": src == "mock", "version": ver, "message": None,
                "latency_ms": round((time.perf_counter() - t) * 1000), "error": None}
    except LibreNMSError as e:
        return {"status": "error", "source": "live", "configured": bool(settings.librenms_url and settings.librenms_api_token),
                "connected": False, "using_mock": False, "version": None, "message": e.message, "latency_ms": None,
                "error": {"code": e.code, "message": e.message}}


@router.get("/settings")
async def get_settings():
    return {"url": settings.librenms_url, "librenms_url": settings.librenms_url, "token_configured": bool(settings.librenms_api_token),
            "request_timeout": settings.request_timeout, "cache_ttl": settings.cache_ttl,
            "mock_fallback": settings.mock_fallback}  # token is never returned


class SettingsBody(BaseModel):
    librenms_url: Optional[str] = Field(None, validation_alias=AliasChoices("librenms_url", "url"))
    librenms_api_token: Optional[str] = Field(None, validation_alias=AliasChoices("librenms_api_token", "token"))  # write-only
    request_timeout: Optional[float] = None


@router.put("/settings")
async def put_settings(b: SettingsBody):
    """Runtime update, in memory only. Persist by editing .env (see README)."""
    if b.librenms_url is not None:
        settings.librenms_url = b.librenms_url.strip()
    if b.librenms_api_token:
        settings.librenms_api_token = b.librenms_api_token.strip()
    if b.request_timeout:
        settings.request_timeout = max(1.0, min(b.request_timeout, 120.0))
    lnms.reset_client()
    return await get_settings()


@router.post("/settings/test")
async def test_settings(b: SettingsBody):
    t = time.perf_counter()
    kw = {"url": b.librenms_url or None, "token": b.librenms_api_token or None, "timeout": b.request_timeout}
    try:
        await lnms.request("GET", "/ping", **kw)
        sysinfo = await lnms.request("GET", "/system", **kw)
        return {"ok": True, "status": 200, "version": (sysinfo.get("system") or [{}])[0].get("local_ver"),
                "latency_ms": round((time.perf_counter() - t) * 1000)}
    except LibreNMSError as e:
        return {"ok": False, "status": e.status, "code": e.code, "message": e.message}


# ---------- devices ----------
DeviceStatus = Literal["all", "active", "ignored", "up", "down", "disabled"]


@router.get("/devices")
async def list_devices(status: DeviceStatus = "all", q_: Optional[str] = Query(None, alias="q"),
                       os: Optional[str] = None, location: Optional[str] = None, sort: str = "hostname",
                       desc: bool = False, page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=5000)):
    items = list((await lnms.get("/devices", {"type": status})).get("devices", []))
    if q_:
        n = q_.lower()
        items = [d for d in items if any(n in str(d.get(f) or "").lower()
                                         for f in ("hostname", "sysName", "ip", "hardware", "os", "location"))]
    if os:
        items = [d for d in items if str(d.get("os") or "").lower() == os.lower()]
    if location:
        items = [d for d in items if location.lower() in str(d.get("location") or "").lower()]
    items.sort(key=lambda d: sort_key(d.get(sort)), reverse=desc)
    rows, total = paginate(items, page, per_page)
    return ok(rows, total=total, page=page, per_page=per_page)


@router.get("/devices/summary")
async def device_summary():
    # Uses only the documented `type` filter. LibreNMS has no "warning"/"unreachable" device state.
    kinds = ["all", "up", "down", "disabled", "ignored"]
    res = await asyncio.gather(*[lnms.get("/devices", {"type": k}, ttl=30) for k in kinds])
    return ok({k: len(r.get("devices", [])) for k, r in zip(kinds, res)})


@router.get("/devices/facets")
async def device_facets():
    ds = (await lnms.get("/devices", {"type": "all"}, ttl=60)).get("devices", [])
    uniq = lambda f: sorted({str(d[f]) for d in ds if d.get(f)})
    return ok({"os": uniq("os"), "location": uniq("location"), "hardware": uniq("hardware")})


ADD_DEVICE_FIELDS = {"hostname", "display", "snmpver", "community", "port", "transport", "authlevel", "authname",
                     "authpass", "authalgo", "cryptopass", "cryptoalgo", "snmp_disable", "force_add", "location",
                     "hardware", "os", "port_association_mode", "poller_group"}


@router.post("/devices")
async def add_device(body: dict):
    """Allow-listed subset of the body is forwarded to LibreNMS POST /devices.
    `ping_fallback` is handled here: if SNMP add fails, retry as ping-only."""
    payload = {k: v for k, v in body.items() if k in ADD_DEVICE_FIELDS and v not in (None, "")}
    if not str(payload.get("hostname") or "").strip():
        raise LibreNMSError(422, "invalid", "A host name or IP address is required.")
    try:
        r = await lnms.request("POST", "/devices", json=payload)
    except LibreNMSError as e:
        if not (body.get("ping_fallback") and not payload.get("snmp_disable") and e.code in ("bad_request", "upstream_error")):
            raise
        r = await lnms.request("POST", "/devices", json={"hostname": payload["hostname"], "snmp_disable": True,
                                                         "force_add": payload.get("force_add", False),
                                                         **({"display": payload["display"]} if "display" in payload else {})})
    lnms.invalidate("/devices")
    return {"source": "live", "data": r}


@router.delete("/devices/{device_id}")
async def remove_device(device_id: str):
    r = await lnms.request("DELETE", f"/devices/{q(device_id)}")
    lnms.invalidate("/devices")
    lnms.invalidate("/ports")
    return {"source": "live", "data": r}


@router.get("/devices/{device_id}")
async def get_device(device_id: str):
    d = (await lnms.get(f"/devices/{q(device_id)}")).get("devices") or []
    if not d:
        raise LibreNMSError(404, "not_found", "Device not found.")
    return ok(d[0])


@router.get("/devices/{device_id}/availability")
async def device_availability(device_id: str):
    return ok((await lnms.get(f"/devices/{q(device_id)}/availability")).get("availability", []))


@router.get("/devices/{device_id}/outages")
async def device_outages(device_id: str):
    return ok((await lnms.get(f"/devices/{q(device_id)}/outages")).get("outages", []))


@router.get("/devices/{device_id}/health/classes")
async def device_health_classes(device_id: str):
    return ok((await lnms.get(f"/devices/{q(device_id)}/health")).get("graphs", []))


@router.get("/devices/{device_id}/health")
async def device_health(device_id: str, classes: str = "processor,mempool,storage"):
    """Per class: list sensors, then fetch each sensor's detail (capped at 30).
    Detail field names for processor/mempool/storage are UNVERIFIED: raw rows are passed through."""
    host = q(device_id)

    async def one(cls: str):
        try:
            lst = await lnms.get(f"/devices/{host}/health/{q(cls)}")
            ids = [g["sensor_id"] for g in lst.get("graphs", []) if "sensor_id" in g][:30]
            det = await asyncio.gather(*[lnms.get(f"/devices/{host}/health/{q(cls)}/{q(i)}") for i in ids])
            return [row for d in det for row in d.get("graphs", [])]
        except LibreNMSError as e:
            return {"error": e.message}

    wanted = [c.strip() for c in classes.split(",") if c.strip()][:10]
    return ok(dict(zip(wanted, await asyncio.gather(*[one(c) for c in wanted]))))


@router.get("/devices/{device_id}/ports")
async def device_ports(device_id: str):
    ports = (await lnms.get(f"/devices/{q(device_id)}/ports", {"columns": PORT_COLUMNS})).get("ports", [])
    for p in ports:
        p["state"] = port_state(p)
    return ok(ports)


# ---------- ports ----------
@router.get("/ports")
async def list_ports(status: Optional[Literal["up", "down", "disabled"]] = None,
                     q_: Optional[str] = Query(None, alias="q"), device_id: Optional[str] = None,
                     errors_only: bool = False, sort: str = "ifName", desc: bool = False,
                     page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=20000)):
    raw, names = await asyncio.gather(lnms.get("/ports", {"columns": PORT_COLUMNS}), device_names())
    items = raw.get("ports", [])
    for p in items:
        p["state"] = port_state(p)
        p["device_hostname"] = names.get(str(p.get("device_id")))
    if status:
        items = [p for p in items if p["state"] == status]
    if device_id:
        items = [p for p in items if str(p.get("device_id")) == device_id]
    if errors_only:
        items = [p for p in items if num(p.get("ifInErrors_delta")) + num(p.get("ifOutErrors_delta")) > 0]
    if q_:
        n = q_.lower()
        items = [p for p in items if any(n in str(p.get(f) or "").lower()
                                         for f in ("ifName", "ifAlias", "ifDescr", "device_hostname"))]
    items.sort(key=lambda p: sort_key(p.get(sort)), reverse=desc)
    rows, total = paginate(items, page, per_page)
    return ok(rows, total=total, page=page, per_page=per_page)


@router.get("/ports/summary")
async def port_summary():
    ports = (await lnms.get("/ports", {"columns": PORT_COLUMNS}, ttl=30)).get("ports", [])
    st = [port_state(p) for p in ports]
    return ok({"total": len(ports), "up": st.count("up"), "down": st.count("down"), "disabled": st.count("disabled"),
               "with_errors": sum(1 for p in ports
                                  if num(p.get("ifInErrors_delta")) + num(p.get("ifOutErrors_delta")) > 0)})


@router.get("/ports/{port_id}")
async def get_port(port_id: int):
    p = (await lnms.get(f"/ports/{port_id}")).get("port") or []
    if not p:
        raise LibreNMSError(404, "not_found", "Port not found.")
    return ok(p[0])


# ---------- alerts ----------
async def enriched_alerts(params: dict):
    raw, rules, names = await asyncio.gather(lnms.get("/alerts", params), lnms.get("/rules", ttl=60), device_names())
    rmap = {str(r.get("id")): r for r in rules.get("rules", [])}
    out = []
    for a in raw.get("alerts", []):
        r = rmap.get(str(a.get("rule_id")), {})
        out.append({**a, "hostname": a.get("hostname") or names.get(str(a.get("device_id"))),
                    "rule_name": r.get("name"), "severity": a.get("severity") or r.get("severity")})
    return out


@router.get("/alerts")
async def list_alerts(state: Optional[int] = Query(None, ge=0, le=2), severity: Optional[Literal["ok", "warning", "critical"]] = None,
                      page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=1000)):
    """state: 0=ok, 1=alert, 2=acknowledged (documented)."""
    params = {k: v for k, v in {"state": state, "severity": severity}.items() if v is not None}
    rows, total = paginate(await enriched_alerts(params), page, per_page)
    return ok(rows, total=total, page=page, per_page=per_page)


@router.get("/alerts/summary")
async def alert_summary():
    active = await enriched_alerts({"state": 1})
    sev = [str(a.get("severity")).lower() for a in active]
    return ok({"active": len(active), "critical": sev.count("critical"), "warning": sev.count("warning"),
               "recent": active[:10]})


class AckBody(BaseModel):
    note: str = ""
    until_clear: bool = True


@router.put("/alerts/{alert_id}/ack")
@router.post("/alerts/{alert_id}/ack")
async def ack_alert(alert_id: int, b: AckBody):
    # Route verified (PUT /alerts/:id). That note/until_clear travel in the JSON body is UNVERIFIED.
    r = await lnms.request("PUT", f"/alerts/{alert_id}", json=b.model_dump())
    lnms.invalidate("/alerts")
    return {"source": "live", "data": r}


# ---------- events / logs ----------
@router.get("/events")
async def events(kind: Literal["eventlog", "syslog", "alertlog"] = "eventlog", device: Optional[str] = None,
                 page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=500),
                 from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                 type_: Optional[Literal["eventlog", "syslog", "alertlog"]] = Query(None, alias="type"),
                 hostname: Optional[str] = None, start: Optional[int] = Query(None, ge=1)):
    # The frontend sends type/hostname/start; kind/device/page are the original names. Both work.
    kind = type_ or kind
    device = hostname or device
    page = start or page
    # `start` is documented as the page number. The device-less form (all devices) is UNVERIFIED.
    path = f"/logs/{kind}" + (f"/{q(device)}" if device else "")
    params = {k: v for k, v in {"start": page, "limit": limit, "from": from_, "to": to}.items() if v is not None}
    raw = await lnms.get(path, params)
    return ok(raw.get("logs", []), total=num(raw.get("total"), raw.get("count", 0)), page=page, per_page=limit)


# ---------- services ----------
@router.get("/services")
async def services(state: Optional[int] = Query(None, ge=0, le=2), type_: Optional[str] = Query(None, alias="type"),
                   device: Optional[str] = None):
    params = {k: v for k, v in {"state": state, "type": type_}.items() if v is not None}
    raw, names = await asyncio.gather(lnms.get("/services" + (f"/{q(device)}" if device else ""), params),
                                      device_names())
    rows = list(flatten(raw.get("services", [])))  # LibreNMS returns a list of single-item lists
    for s in rows:
        s["hostname"] = names.get(str(s.get("device_id")))
    return ok(rows)


# ---------- topology ----------
@router.get("/topology")
async def topology():
    links, devs = await asyncio.gather(lnms.get("/resources/links"), lnms.get("/devices", {"type": "all"}, ttl=60))
    nodes = {str(d["device_id"]): {"id": str(d["device_id"]), "hostname": d.get("hostname"),
                                   "status": d.get("status"), "managed": True}  # `status` UNVERIFIED field
             for d in devs.get("devices", []) if "device_id" in d}
    edges, seen = [], set()
    for l in links.get("links", []):
        a = str(l.get("local_device_id"))
        rid = l.get("remote_device_id")
        b = str(rid) if rid is not None else f"ext:{l.get('remote_hostname')}"
        if a not in nodes:
            nodes[a] = {"id": a, "hostname": None, "status": None, "managed": True}
        if b not in nodes:
            nodes[b] = {"id": b, "hostname": l.get("remote_hostname"), "status": None, "managed": rid is not None}
        key = tuple(sorted([(a, str(l.get("local_port_id"))), (b, str(l.get("remote_port_id")))]))
        if key in seen:
            continue
        seen.add(key)
        edges.append({"id": l.get("id"), "source": a, "target": b, "local_port_id": l.get("local_port_id"),
                      "remote_port_id": l.get("remote_port_id"), "remote_port": l.get("remote_port"),
                      "protocol": l.get("protocol"), "active": l.get("active")})
    return ok({"nodes": list(nodes.values()), "edges": edges})


# ---------- graph images (historical traffic until a metric store is wired in) ----------
@router.get("/graph/device/{device_id}/{graph_type}")
async def device_graph(device_id: str, graph_type: str, from_: Optional[str] = Query(None, alias="from"),
                       to: Optional[str] = None, width: int = Query(900, le=2000), height: int = Query(300, le=1000)):
    params = {k: v for k, v in {"from": from_, "to": to, "width": width, "height": height}.items() if v is not None}
    body, ct = await lnms.request("GET", f"/devices/{q(device_id)}/{q(graph_type)}", params=params, raw=True)
    return Response(content=body, media_type=ct, headers={"Cache-Control": "max-age=30"})


@router.get("/graph/port/{device_id}")
async def port_graph(device_id: str, ifname: str, graph_type: str = "port_bits",
                     from_: Optional[str] = Query(None, alias="from"), to: Optional[str] = None,
                     width: int = Query(900, le=2000), height: int = Query(300, le=1000)):
    params = {k: v for k, v in {"from": from_, "to": to, "width": width, "height": height}.items() if v is not None}
    body, ct = await lnms.request("GET", f"/devices/{q(device_id)}/ports/{q(ifname)}/{q(graph_type)}",
                                  params=params, raw=True)
    return Response(content=body, media_type=ct, headers={"Cache-Control": "max-age=30"})


# ---------- network discovery (scan a range, add what answers) ----------
import ipaddress  # noqa: E402
import platform  # noqa: E402
import re  # noqa: E402
import socket  # noqa: E402
import subprocess  # noqa: E402
from concurrent.futures import ThreadPoolExecutor  # noqa: E402

MAX_SCAN_HOSTS = 1024
MAX_BULK_ADD = 256
_scan_pool = ThreadPoolExecutor(max_workers=64)
_IS_WIN = platform.system() == "Windows"


def parse_targets(text: str) -> list[str]:
    """Accepts CIDR (172.16.32.0/24), a prefix (172.16.32. or 172.16.32), a last-octet range
    (172.16.32.10-50) or a single IP. IPv4 only."""
    t = (text or "").strip()
    if not t:
        raise LibreNMSError(422, "invalid", "Enter an IP range to scan, for example 172.16.32.0/24.")
    m = re.fullmatch(r"(\d{1,3}(?:\.\d{1,3}){2})\.?\*?", t)
    if m:
        t = f"{m.group(1)}.0/24"
    m = re.fullmatch(r"(\d{1,3}(?:\.\d{1,3}){2})\.(\d{1,3})\s*-\s*(\d{1,3})", t)
    try:
        if m:
            a, b = int(m.group(2)), int(m.group(3))
            if not (0 <= a <= b <= 255):
                raise ValueError
            ips = [str(ipaddress.IPv4Address(f"{m.group(1)}.{i}")) for i in range(a, b + 1)]
        else:
            net = ipaddress.ip_network(t, strict=False)
            if net.version != 4:
                raise ValueError
            ips = [str(h) for h in net.hosts()]
    except ValueError:
        raise LibreNMSError(422, "invalid", "That is not a valid IPv4 range. Use 172.16.32.0/24, 172.16.32. or 172.16.32.10-50.")
    if len(ips) > MAX_SCAN_HOSTS:
        raise LibreNMSError(422, "too_large", "That range is too large. The limit is 1024 addresses (a /22).")
    return ips


def _ping_blocking(ip: str) -> bool:
    args = ["ping", "-n", "1", "-w", "1000", ip] if _IS_WIN else ["ping", "-c", "1", "-W", "1", ip]
    try:
        r = subprocess.run(args, capture_output=True, timeout=5,
                           creationflags=0x08000000 if _IS_WIN else 0)  # CREATE_NO_WINDOW
        # Windows returns 0 even for "host unreachable" replies from a gateway; a real reply has TTL=.
        return b"ttl=" in r.stdout.lower()
    except Exception:
        return False


def _rdns_blocking(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ""


@router.post("/discovery/scan")
async def discovery_scan(body: dict):
    ips = parse_targets(str(body.get("target", "")))
    loop = asyncio.get_running_loop()
    alive_flags = await asyncio.gather(*[loop.run_in_executor(_scan_pool, _ping_blocking, ip) for ip in ips])
    alive = [ip for ip, a in zip(ips, alive_flags) if a]

    known: set[str] = set()
    try:
        raw = await lnms.get("/devices", ttl=0)
        for d in (raw.get("devices") if isinstance(raw, dict) else raw) or []:
            known.update(str(d.get(k)) for k in ("hostname", "ip") if d.get(k))
    except LibreNMSError:
        pass

    async def name_of(ip: str) -> str:
        try:
            return await asyncio.wait_for(loop.run_in_executor(_scan_pool, _rdns_blocking, ip), 2.5)
        except Exception:
            return ""

    names = await asyncio.gather(*[name_of(ip) for ip in alive])
    found = [{"ip": ip, "name": n, "already_added": ip in known} for ip, n in zip(alive, names)]
    return {"source": lnms.state["source"], "data": {"target": body.get("target"), "scanned": len(ips), "found": found}}


@router.post("/discovery/add")
async def discovery_add(body: dict):
    hosts = body.get("hosts") or []
    if not isinstance(hosts, list) or not hosts:
        raise LibreNMSError(422, "invalid", "Select at least one device to add.")
    if len(hosts) > MAX_BULK_ADD:
        raise LibreNMSError(422, "too_large", "Add at most 256 devices at a time.")
    clean = []
    for h in hosts:
        try:
            clean.append(str(ipaddress.IPv4Address(str(h).strip())))
        except ValueError:
            raise LibreNMSError(422, "invalid", "One of the selected addresses is not a valid IPv4 address.")
    ping_only = bool(body.get("ping_only"))
    community = str(body.get("community") or "")
    if not ping_only and not community:
        raise LibreNMSError(422, "invalid", "Enter the SNMP community, or choose ping only.")

    sem = asyncio.Semaphore(3)  # LibreNMS add can take several seconds; do not flood it

    async def one(ip: str):
        payload: dict = {"hostname": ip}
        if ping_only:
            payload["snmp_disable"] = True
        else:
            payload.update(snmpver=body.get("snmpver") or "v2c", community=community,
                           ping_fallback=bool(body.get("ping_fallback", True)))
        if body.get("force_add"):
            payload["force_add"] = True
        async with sem:
            try:
                await add_device(payload)
                return {"host": ip, "ok": True, "message": ""}
            except LibreNMSError as e:
                return {"host": ip, "ok": False, "message": e.message}

    results = await asyncio.gather(*[one(ip) for ip in clean])
    lnms.invalidate("/devices")
    return {"source": lnms.state["source"], "data": {"results": results,
                                                     "added": sum(1 for r in results if r["ok"]),
                                                     "failed": sum(1 for r in results if not r["ok"])}}
