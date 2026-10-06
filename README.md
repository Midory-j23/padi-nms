# Padi NMS

A modern, bilingual (English / Persian) web dashboard for [LibreNMS](https://www.librenms.org/). It gives you a fast, mobile-friendly view of your network and lets you add devices, including whole IP ranges, without opening LibreNMS.

## Features

- **Dashboard** with devices that need attention and recent events
- **Devices** list with search by name, IP, OS, hardware or location (for example `172.16.32.`), status filter and sorting
- **Device page** with overview, CPU / memory / storage, availability, downtime events and ports
- **Add device** by SNMP (v1, v2c, v3) or ping only
- **Scan network**: enter a range such as `172.16.32.0/24`, see every address that answers, and add them all at once
- **Remove device** with confirmation
- **Ports, Alerts, Availability, Services, Logs, Network map and Performance** pages
- **Persian (RTL) and English**, switchable at any time, with Persian digits and Jalali dates in Persian
- **Light and dark theme**
- **Responsive**: slide-in menu and card-style tables on phones
- **Backend address** can be changed from the Settings page, so nothing is hardcoded

## How it works

```
Browser  ->  Padi frontend (React)  ->  Padi backend (FastAPI)  ->  LibreNMS API
```

The backend keeps your LibreNMS API token on the server, so it is never sent to the browser. The frontend only talks to the backend.

## Requirements

- A running LibreNMS with an API token (LibreNMS: user menu > API Settings > Create API access token)
- Python 3.10 or newer
- Node.js 18 or newer

## Quick start

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate       # Linux / macOS
pip install -r requirements.txt
```

Create `backend/.env` from the example and fill it in:

```bash
copy .env.example .env            # Windows
# cp .env.example .env            # Linux / macOS
```

```ini
LIBRENMS_URL=http://localhost:8000
LIBRENMS_API_TOKEN=your_token_here
MOCK_FALLBACK=false
CORS_ORIGINS=http://localhost:5173
```

Start it. If LibreNMS already uses port 8000 (the Docker default), use another port such as 8001:

```bash
uvicorn app.main:app --reload --port 8001
```

Check `http://localhost:8001/api/health`. It should report `"status": "ok"`.

### 2. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```ini
VITE_BACKEND_URL=http://localhost:8001
```

```bash
npm run dev
```

Open <http://localhost:5173>. The top bar shows your LibreNMS version when everything is connected.

You can also leave `VITE_BACKEND_URL` unset and enter the address in **Settings > Backend address** instead.

## Configuration

| Setting | Where | Meaning |
|---|---|---|
| `LIBRENMS_URL` | backend `.env` | Base address of LibreNMS, for example `http://localhost:8000`. No `/api` and no trailing path. |
| `LIBRENMS_API_TOKEN` | backend `.env` | LibreNMS API token |
| `MOCK_FALLBACK` | backend `.env` | `true` shows sample data when LibreNMS is unreachable. Use `false` for real monitoring. |
| `CORS_ORIGINS` | backend `.env` | Comma-separated list of frontend addresses allowed to call the backend. Add your PC's address (for example `http://192.168.1.50:5173`) to use the app from other devices. |
| `VITE_BACKEND_URL` | frontend `.env` | Where the dev server proxies `/api`. Defaults to `http://localhost:8000`. |

Settings saved from the app's Settings page are kept in the backend's memory only. Put permanent values in `backend/.env`.

## Scanning a network

1. Open **Devices > Scan network**.
2. Enter a range: `172.16.32.0/24`, `172.16.32.` or `172.16.32.10-50` (up to 1024 addresses).
3. The backend pings every address and lists those that answer. Devices already in LibreNMS are marked.
4. Choose **Ping only**, or enter an SNMP community (with "if SNMP fails, add as ping only" for mixed networks).
5. Click **Add selected**.

Devices that block ping will not appear. Add those with **Add device**.

## Using it on a phone

Open `http://YOUR-PC-IP:5173` on a phone on the same network. For this to work:

- start the dev server so it listens on the network (it already does with `host: true`),
- add `http://YOUR-PC-IP:5173` to `CORS_ORIGINS`,
- set the backend address in Settings to `http://YOUR-PC-IP:8001`, not `localhost`.

## Project structure

```
padi-nms/
  backend/
    app/
      main.py            FastAPI app and CORS
      config.py          Settings from .env
      api/routes.py      API endpoints (devices, ports, alerts, discovery, ...)
      services/
        librenms.py      LibreNMS API client
        mock.py          Sample data
  frontend/
    src/
      api/               API client and types
      components/        Layout, tables, dialogs
      lib/               Formatting, i18n, theme, helpers
      pages/             One file per page
```

## Backend API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Connection status |
| GET / PUT | `/api/settings` | Read or change the LibreNMS address and token |
| GET | `/api/devices` | List devices |
| POST | `/api/devices` | Add a device |
| DELETE | `/api/devices/{id}` | Remove a device |
| GET | `/api/ports`, `/api/alerts`, `/api/services`, `/api/events` | Lists |
| POST | `/api/discovery/scan` | Ping-scan an IP range |
| POST | `/api/discovery/add` | Add several devices at once |

FastAPI's interactive docs are at `/docs` on the backend.

## Troubleshooting

- **"API authentication failed"**: check the token, and that `LIBRENMS_URL` is only the base address. Test the token directly: `curl -H "X-Auth-Token: YOUR_TOKEN" http://localhost:8000/api/v0/devices`
- **Status shows "Sample data"**: LibreNMS is not configured or `MOCK_FALLBACK=true`. Set the URL and token.
- **"Test backend" fails**: the backend is not running, the address is wrong, or `CORS_ORIGINS` does not include the page's address.
- **Port 8000 already in use**: LibreNMS (Docker) uses it. Run the backend on 8001.
- **"Could not ping host" when adding a device from Docker**: tick "Add even if LibreNMS cannot reach them now", or add as ping only.
- **New devices look empty**: LibreNMS needs a polling cycle (about 5 minutes) before data appears.

## Security notes

- Never commit `backend/.env`. It is listed in `.gitignore`.
- If a token was ever exposed, delete it in LibreNMS and create a new one.
- Do not expose the backend to the internet without authentication and HTTPS in front of it.

## License

Add a license of your choice (for example MIT) before publishing.
