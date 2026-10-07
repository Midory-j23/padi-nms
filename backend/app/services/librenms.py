"""Centralized LibreNMS API client: auth header, timeouts, HTTP/network error mapping,
TTL cache, and optional mock fallback. Routes never talk to httpx directly."""
import time

import httpx

from app.config import settings
from app.services.mock import MISSING, mock_for

API_PREFIX = "/api/v0"
state = {"source": "live"}  # "live" | "mock": where the most recent get() was served from
_cache: dict = {}
_client: httpx.AsyncClient | None = None


class LibreNMSError(Exception):
    """User-safe error: `message` is shown in the UI, never a stack trace."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def reset_client() -> None:
    """Call after settings change (verify_ssl is bound at client creation)."""
    global _client
    _client = None
    _cache.clear()


def invalidate(prefix: str) -> None:
    for k in [k for k in _cache if k[0].startswith(prefix)]:
        _cache.pop(k, None)


def _http() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(verify=settings.verify_ssl)
    return _client


async def request(method: str, path: str, params=None, json=None, raw=False,
                  url: str | None = None, token: str | None = None, timeout: float | None = None):
    base = (url or settings.librenms_url).rstrip("/")
    tok = token or settings.librenms_api_token
    if not base or not tok:
        raise LibreNMSError(503, "not_configured", "LibreNMS URL or API token is not configured.")
    try:
        r = await _http().request(
            method, base + API_PREFIX + path, params=params, json=json,
            headers={"X-Auth-Token": tok, "Accept": "application/json"},
            timeout=timeout or settings.request_timeout)
    except httpx.TimeoutException:
        raise LibreNMSError(504, "timeout", "LibreNMS server did not respond in time.") from None
    except httpx.HTTPError:
        raise LibreNMSError(503, "unreachable", "LibreNMS server is unreachable.") from None

    sc = r.status_code

    def upstream_msg() -> str:
        # LibreNMS explains add/delete failures in `message` (e.g. "Could not ping host"). Pass it along.
        try:
            m = r.json().get("message")
            return f" {m}" if m else ""
        except Exception:
            return ""
    if sc == 401:
        raise LibreNMSError(401, "auth", "API authentication failed.")
    if sc == 403:
        raise LibreNMSError(403, "forbidden", "The API token is not allowed to access this resource.")
    if sc == 404:
        raise LibreNMSError(404, "not_found", "The requested item was not found in LibreNMS.")
    if sc >= 500:
        raise LibreNMSError(502, "upstream_error", "LibreNMS reported an internal error." + upstream_msg())
    if sc >= 400:
        raise LibreNMSError(502, "bad_request", "LibreNMS rejected the request." + upstream_msg())
    if raw:
        return r.content, r.headers.get("content-type", "image/png")
    try:
        data = r.json()
    except ValueError:
        raise LibreNMSError(502, "invalid_response", "LibreNMS returned an invalid response.") from None
    if not data:
        raise LibreNMSError(502, "empty", "LibreNMS returned an empty response.")
    if isinstance(data, dict) and data.get("status") == "error":
        raise LibreNMSError(502, "upstream_error", str(data.get("message") or "LibreNMS returned an error."))
    return data


async def get(path: str, params: dict | None = None, ttl: int | None = None):
    """Cached GET. Falls back to mock data only when LibreNMS is unreachable/unconfigured."""
    ttl = settings.cache_ttl if ttl is None else ttl
    key = (path, tuple(sorted((params or {}).items())))
    hit = _cache.get(key)
    if ttl and hit and hit[0] > time.monotonic():
        state["source"] = "live"
        return hit[1]
    try:
        data, src = await request("GET", path, params), "live"
    except LibreNMSError as e:
        mock = mock_for(path, params) if (settings.mock_fallback and e.code in
                                          ("unreachable", "timeout", "not_configured")) else None
        if mock is MISSING:
            raise LibreNMSError(404, "not_found", "The requested item was not found in LibreNMS.") from None
        if mock is None:
            raise
        data, src = mock, "mock"
    state["source"] = src
    if ttl and src == "live":
        if len(_cache) > 500:
            now = time.monotonic()
            for k in [k for k, v in _cache.items() if v[0] <= now]:
                _cache.pop(k, None)
        _cache[key] = (time.monotonic() + ttl, data)
    return data
