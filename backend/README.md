# LibreNMS UI: backend proxy

FastAPI service that holds the LibreNMS API token and exposes a small, cached, paginated API
to the React frontend. The token never reaches the browser.

## Run
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # set LIBRENMS_URL and LIBRENMS_API_TOKEN
uvicorn app.main:app --reload --port 8000
```
Interactive docs: http://localhost:8000/docs. With no URL/token set (or LibreNMS down) and
`MOCK_FALLBACK=true`, responses carry `"source": "mock"`; real data is used automatically once reachable.

Create the token in LibreNMS: Settings (gear) > API Settings > API Access > Create API access token.

## Response shape
`{"source": "live"|"mock", "data": ..., "total", "page", "per_page"}`; errors:
`{"error": {"code", "message"}}` with codes `unreachable, timeout, auth, forbidden, not_found,
upstream_error, invalid_response, empty, not_configured`.

## Endpoint map (UI > backend > LibreNMS /api/v0)
| Backend | LibreNMS | Status |
|---|---|---|
| GET /api/health | /ping, /system | verified |
| GET /api/devices, /summary, /facets | /devices?type= (filtering/paging done here) | verified; device field names (status, uptime, last_polled) UNVERIFIED |
| GET /api/devices/{id} | /devices/:host | verified |
| .../availability, .../outages | /devices/:host/availability, /outages | verified |
| .../health, .../health/classes | /devices/:host/health[/:type[/:id]] | verified; processor/mempool/storage row fields UNVERIFIED |
| .../ports, GET /api/ports, /summary, /ports/{id} | /devices/:host/ports, /ports?columns=, /ports/:id | verified; rate units UNVERIFIED |
| GET /api/alerts, /summary; PUT /alerts/{id}/ack | /alerts, /rules, PUT /alerts/:id | verified; ack body fields UNVERIFIED |
| GET /api/events | /logs/{eventlog,syslog,alertlog}[/:host] | verified; all-devices form UNVERIFIED |
| GET /api/services | /services[/:host] | verified (nested lists flattened) |
| GET /api/topology | /resources/links, /devices | verified |
| GET /api/graph/device/..., /graph/port/... | /devices/:host/:type, /devices/:host/ports/:ifname/:type | verified (PNG) |
| /api/settings (GET/PUT/test) | n/a (runtime; PUT is in-memory, edit .env to persist) | n/a |

Not exposed by LibreNMS as JSON (documented): historical traffic series, response time,
packet loss. Planned: your metric store (Prometheus/InfluxDB).
