"""Prometheus integration, both directions.

 * metrics_router:  GET /metrics            Padi publishes LibreNMS data for Prometheus to scrape.
 * router:          /api/prometheus/...     Padi reads time series back from a Prometheus server.
"""
import asyncio
import hmac
import math
import re
import time
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Header, Query, Response

from app.config import settings
from app.services import librenms as lnms
from app.services.librenms import LibreNMSError

router = APIRouter(prefix="/api")
metrics_router = APIRouter()


# =====================================================================================
# A. Exposition: GET /metrics
# =====================================================================================
def _esc(v) -> str:
    return str(v).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _labels(**kw) -> str:
    items = [f'{k}="{_esc(v)}"' for k, v in kw.items() if v not in (None, "")]
    return "{" + ",".join(items) + "}" if items else ""


def _f(v, default=None):
    try:
        x = float(v)
        return x if math.isfinite(x) else default
    except (TypeError, ValueError):
        return default


class _Out:
    def __init__(self):
        self.lines: list[str] = []
        self._seen: set[str] = set()

    def add(self, name: str, help_: str, typ: str, value, **labels):
        v = _f(value)
        if v is None:
            return
        if name not in self._seen:
            self._seen.add(name)
            self.lines += [f"# HELP {name} {help_}", f"# TYPE {name} {typ}"]
        self.lines.append(f"{name}{_labels(**labels)} {v:g}")

    def text(self) -> str:
        return "\n".join(self.lines) + "\n"


@metrics_router.get("/metrics", include_in_schema=False)
async def metrics(authorization: Optional[str] = Header(None)):
    if settings.metrics_token:
        given = (authorization or "").removeprefix("Bearer ").strip()
        if not hmac.compare_digest(given, settings.metrics_token):
            return Response("unauthorized\n", status_code=401, media_type="text/plain",
                            headers={"WWW-Authenticate": "Bearer"})
    out = _Out()
    t0 = time.perf_counter()
    try:
        dev_raw, alert_raw = await asyncio.gather(
            lnms.get("/devices", {"type": "all"}, ttl=15), lnms.get("/alerts", {"state": 1}, ttl=15))
        ports_raw = None
        if settings.metrics_include_ports:
            ports_raw = await lnms.get("/ports", {"columns": "port_id,device_id,ifName,ifOperStatus,ifAdminStatus,"
                                                             "ifInOctets,ifOutOctets,ifInErrors,ifOutErrors"}, ttl=15)
        live = lnms.state["source"] == "live"
    except LibreNMSError:
        out.add("padi_librenms_up", "1 if Padi can read LibreNMS, else 0.", "gauge", 0)
        return Response(out.text(), media_type="text/plain; version=0.0.4; charset=utf-8")

    out.add("padi_librenms_up", "1 if Padi can read LibreNMS, else 0.", "gauge", 1 if live else 0)
    out.add("padi_sample_data", "1 if Padi is serving built-in sample data instead of LibreNMS.", "gauge", 0 if live else 1)
    out.add("padi_librenms_response_seconds", "Time Padi needed to collect this scrape from LibreNMS.", "gauge",
            time.perf_counter() - t0)

    devices = dev_raw.get("devices") or []
    out.add("padi_devices", "Number of devices known to LibreNMS.", "gauge", len(devices))
    for d in devices:
        lab = dict(device_id=d.get("device_id"), hostname=d.get("hostname"), ip=d.get("ip"),
                   os=d.get("os"), type=d.get("type"))
        up = 1 if _f(d.get("status"), 0) == 1 and not _f(d.get("disabled"), 0) else 0
        out.add("padi_device_up", "1 if the device is up, 0 if down or disabled.", "gauge", up, **lab)
        out.add("padi_device_uptime_seconds", "Device uptime reported by SNMP.", "gauge", d.get("uptime"), **lab)
        out.add("padi_device_last_polled_timestamp_seconds", "Unix time of the last poll.", "gauge",
                _parse_ts(d.get("last_polled")), **lab)

    alerts = alert_raw.get("alerts") or []
    counts: dict[str, int] = {}
    for a in alerts:
        sev = str(a.get("severity") or "unknown").lower()
        counts[sev] = counts.get(sev, 0) + 1
    for sev in sorted(set(counts) | {"critical", "warning"}):
        out.add("padi_alerts_active", "Active alerts by severity.", "gauge", counts.get(sev, 0), severity=sev)

    if ports_raw is not None:
        names = {str(d.get("device_id")): d.get("hostname") for d in devices}
        for p in ports_raw.get("ports") or []:
            lab = dict(device=names.get(str(p.get("device_id"))), port=p.get("ifName"))
            up = 1 if p.get("ifOperStatus") == "up" else 0
            out.add("padi_port_up", "1 if the port is operationally up.", "gauge", up, **lab)
            out.add("padi_port_in_octets_total", "Octets received (counter).", "counter", p.get("ifInOctets"), **lab)
            out.add("padi_port_out_octets_total", "Octets sent (counter).", "counter", p.get("ifOutOctets"), **lab)
            out.add("padi_port_in_errors_total", "Input errors (counter).", "counter", p.get("ifInErrors"), **lab)
            out.add("padi_port_out_errors_total", "Output errors (counter).", "counter", p.get("ifOutErrors"), **lab)
    return Response(out.text(), media_type="text/plain; version=0.0.4; charset=utf-8")


def _parse_ts(v):
    if not v:
        return None
    try:
        return time.mktime(time.strptime(str(v)[:19], "%Y-%m-%d %H:%M:%S"))
    except ValueError:
        return None


# =====================================================================================
# B. Reading from Prometheus: /api/prometheus/...
# =====================================================================================
_client: Optional[httpx.AsyncClient] = None
RANGES = {900, 3600, 21600, 86400, 604800}  # 15 min, 1 h, 6 h, 24 h, 7 d
MAX_SERIES = 12


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(verify=settings.verify_ssl)
    return _client


async def prom(path: str, params: dict) -> dict:
    base = settings.prometheus_url.rstrip("/")
    if not base:
        raise LibreNMSError(503, "prom_not_configured", "Prometheus address is not configured.")
    try:
        r = await _http().get(base + path, params=params, timeout=settings.request_timeout)
    except httpx.TimeoutException:
        raise LibreNMSError(504, "prom_timeout", "Prometheus did not respond in time.") from None
    except httpx.HTTPError:
        raise LibreNMSError(503, "prom_unreachable", "Prometheus is unreachable.") from None
    try:
        body = r.json()
    except ValueError:
        body = {}
    if r.status_code >= 500:
        raise LibreNMSError(502, "prom_error", "Prometheus reported an internal error.")
    if r.status_code >= 400 or body.get("status") == "error":
        detail = str(body.get("error") or "")[:200]
        raise LibreNMSError(400 if r.status_code < 500 else 502, "prom_bad_query",
                            "Prometheus rejected the query." + (f" {detail}" if detail else ""))
    return body.get("data") or {}


def _series(result: list, name_label: Optional[str] = None) -> list[dict]:
    out = []
    for s in result[:MAX_SERIES]:
        metric = s.get("metric") or {}
        pts = []
        for ts, v in s.get("values") or []:
            x = _f(v)
            if x is not None:
                pts.append([float(ts), round(x, 4)])
        if pts:
            label = metric.get(name_label, "") if name_label else ""
            if not label and not name_label:
                label = ", ".join(f"{k}={v}" for k, v in metric.items() if k not in ("__name__", "job"))[:80]
            out.append({"label": label, "metric": metric, "points": pts})
    return out


async def _range(query: str, seconds: int, name_label: Optional[str] = None) -> list[dict]:
    end = time.time()
    step = max(15, seconds // 240)
    data = await prom("/api/v1/query_range", {"query": query, "start": end - seconds, "end": end, "step": step})
    return _series(data.get("result") or [], name_label)


def _check_range(seconds: int) -> int:
    if seconds not in RANGES:
        raise LibreNMSError(422, "invalid", "Choose one of the offered time ranges.")
    return seconds


@router.get("/prometheus/status")
async def prom_status():
    if not settings.prometheus_url:
        return {"configured": False, "ok": False, "version": None, "latency_ms": None, "message": None}
    t0 = time.perf_counter()
    try:
        try:
            info = await prom("/api/v1/status/buildinfo", {})
            ver = info.get("version")
        except LibreNMSError as e:
            if e.code != "prom_bad_query":
                raise
            await prom("/api/v1/query", {"query": "vector(1)"})  # very old servers have no buildinfo
            ver = None
        return {"configured": True, "ok": True, "version": ver,
                "latency_ms": round((time.perf_counter() - t0) * 1000), "message": None}
    except LibreNMSError as e:
        return {"configured": True, "ok": False, "version": None, "latency_ms": None, "message": e.message}


@router.get("/prometheus/query_range")
async def prom_query_range(query: str = Query(..., min_length=1, max_length=2000), range: int = 3600):
    return {"data": {"series": await _range(query, _check_range(range))}}


# ---- per-device panels (standard exporters: node_exporter, blackbox_exporter) ----
def _matcher(names: list[str]) -> str:
    """PromQL label matcher for a device: instance is `host` or `host:port`."""
    alts = [re.escape(n) for n in dict.fromkeys(names) if n and re.fullmatch(r"[A-Za-z0-9._-]+", n)]
    if not alts:
        raise LibreNMSError(422, "invalid", "This device has no usable host name or IP address.")
    rx = "(" + "|".join(alts) + ")(:[0-9]+)?"
    return 'instance=~"' + rx.replace("\\", "\\\\") + '"'


FS = 'fstype!~"tmpfs|overlay|squashfs|ramfs|devtmpfs"'
NIC = 'device!~"lo|veth.*|docker.*|br-.*"'
# id, title, unit, label key, query template (@M@ = instance matcher)
PANELS = [
    ("cpu", "CPU", "%", None,
     '100 - (avg(rate(node_cpu_seconds_total{mode="idle",@M@}[5m])) * 100)'),
    ("memory", "Memory", "%", None,
     '100 * (1 - (node_memory_MemAvailable_bytes{@M@} / node_memory_MemTotal_bytes{@M@}))'),
    ("disk", "Disk usage", "%", "mountpoint",
     'max by (mountpoint) (100 - (node_filesystem_avail_bytes{@M@,' + FS + '} / node_filesystem_size_bytes{@M@,' + FS + '} * 100))'),
    ("net_in", "Network in", "bit/s", None,
     'sum(rate(node_network_receive_bytes_total{@M@,' + NIC + '}[5m])) * 8'),
    ("net_out", "Network out", "bit/s", None,
     'sum(rate(node_network_transmit_bytes_total{@M@,' + NIC + '}[5m])) * 8'),
    ("ping", "Ping latency", "ms", None, 'avg(probe_duration_seconds{@M@}) * 1000'),
    ("reachable", "Reachable (probe)", "", None, 'min(probe_success{@M@})'),
]


@router.get("/devices/{device_id}/prometheus")
async def device_prometheus(device_id: str, range: int = 3600):
    seconds = _check_range(range)
    raw = await lnms.get(f"/devices/{quote(str(device_id), safe='')}")
    devs = raw.get("devices") or []
    if not devs:
        raise LibreNMSError(404, "not_found", "Device not found.")
    d = devs[0]
    m = _matcher([d.get("ip"), d.get("hostname"), d.get("sysName")])

    async def run(p):
        pid, title, unit, label, tpl = p
        return {"id": pid, "title": title, "unit": unit, "series": await _range(tpl.replace("@M@", m), seconds, label)}

    results = await asyncio.gather(*[run(p) for p in PANELS], return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    if len(errors) == len(results):
        raise errors[0]  # Prometheus itself is down or misconfigured
    # A panel that fails (for example the exporter is not installed) is simply shown empty.
    panels = [r if not isinstance(r, Exception) else {"id": p[0], "title": p[1], "unit": p[2], "series": []}
              for r, p in zip(results, PANELS)]
    return {"data": {"matcher": m, "range": seconds, "panels": panels}}
