# Padi NMS frontend

React + Vite + TypeScript + Tailwind. Talks only to the FastAPI proxy in `../backend` (never to LibreNMS directly).

## Run
```bash
cd Padi_NMS/frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to http://localhost:8000
```
Start the backend first (`uvicorn app.main:app --reload --port 8000`).

## Status
Step 2 (shell): layout, light/dark theme, auto-refresh selector, connection status, typed API client.
Step 3: Devices table (search, status filter, sorting, paging, lazy CPU/memory per visible row) and Device Details (overview, resources, availability, downtime events, ports).
Step 4: Ports page (all ports, search, device and status filters, sorting, paging) and Alerts page (active/acknowledged/all, severity filter, acknowledge with note).
Step 5: real Dashboard (needs-attention list, counts, recent events), Availability, Services and Logs pages.
Step 6: Network map (LLDP/CDP links, built-in layout, zoom and pan), Performance (live port traffic chart; history waits for a metric store) and Settings (server URL, token, connection test, browser preferences).

## Unverified against a live server
- Field names for devices, health, ports, services, logs and topology (see comments marked UNVERIFIED in `src/api/types.ts`).
- Port `*_rate` units (assumed bytes per second).
- Proxy contracts: alert acknowledge method (`ACK_METHOD`), settings save method (`SETTINGS_METHOD`), and `/api/events` query parameters, all in `src/api/client.ts`.

## Language (English and Persian)
The top bar has a language button next to the theme toggle, and Settings has a language list. Persian switches the whole app to right-to-left, uses Persian digits and the Jalali calendar, and loads the Vazirmatn font. The choice is remembered in the browser; on a first visit the browser language decides.

- Strings live in `src/lib/fa.ts`. The English text in the code is the key, and anything missing from the table falls back to English.
- Fonts are bundled through `@fontsource-variable/*`, so the app needs no internet access (no Google Fonts). Run `npm install` after updating.
- Text that comes from LibreNMS itself (rule names, log messages, host names) is shown as received and is not translated.

## Adding devices from the app
Devices > Add device creates a device in LibreNMS through the backend, so nobody has to open LibreNMS. It supports SNMP v1, v2c and v3, ping-only devices (clients and anything without SNMP), and the options "add even if it does not answer now" and "if SNMP fails, add as ping only".

The frontend sends `POST /api/devices` with LibreNMS field names (`hostname`, `snmpver`, `community`, `authlevel`, `authname`, `authpass`, `authalgo`, `cryptopass`, `cryptoalgo`, `snmp_disable`, `force_add`, `ping_fallback`, `port`, `transport`, `display`, `location`, `hardware`, `os`). The backend must accept this route and forward an allow-listed subset to LibreNMS `POST /api/v0/devices`. UNVERIFIED against a live server.

## Removing devices
On a device page, **Remove device** opens a confirmation that names the device and asks you to type its host name before the button is enabled. The frontend calls `DELETE /api/devices/:id`; the backend must map that to LibreNMS `DELETE /api/v0/devices/:hostname` (LibreNMS accepts the device id there). Removing a device deletes its history in LibreNMS and cannot be undone. UNVERIFIED against a live server.
