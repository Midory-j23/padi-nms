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


## MongoDB (optional): devices, users and audit log
Set `MONGODB_URI` (and optionally `MONGODB_DB`, default `padi_nms`) in `.env` and restart the backend. Leave `MONGODB_URI` empty to run without it; monitoring, add and remove keep working.
Collections are created automatically at start-up (no setup script needed):

- `devices`: every device added through the app (single add, network scan): host name, display name, type, SNMP version, location, LibreNMS device id, source, who added it and when. Removing a device marks its record `removed` (kept for history). SNMP communities and passwords are never stored. Records from the older `clients` collection are copied here once.
- `app_users`: a copy of the app's users (username, full name, role, active, created, last login). It is updated on every create / edit / delete / sign-in and fully re-synced at each backend start. Passwords and password hashes are never stored there; sign-in and sessions stay in the SQLite file.
- `audit_log`: every device add / edit / remove and user create / update / delete, with who did it. Admin-only read: `GET /api/audit`.
